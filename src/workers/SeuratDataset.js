import * as scran from "scran.js";
import * as bioc from "bioconductor";
import { isSeuratObject, convertSeuratToSCE } from "./seurat-adapter.js";

/**
 * Simple file wrapper compatible with bakana
 */
class SimpleFile {
  #content;

  constructor(content) {
    this.#content = content;
  }

  async buffer() {
    if (this.#content instanceof File) {
      return await this.#content.arrayBuffer();
    } else if (this.#content instanceof Uint8Array) {
      return this.#content.buffer;
    } else if (this.#content instanceof ArrayBuffer) {
      return this.#content;
    } else {
      throw new Error("Unsupported file content type");
    }
  }
}

/**
 * Custom Dataset class for Seurat objects.
 * Wraps Seurat data and presents it as SCE-compatible format.
 *
 * After load(), exposes synchronous properties that match bakana's
 * H5adResult.load() return value:
 *   - cells: bioc.DataFrame
 *   - features: { modalityName: bioc.DataFrame }
 *   - reduced_dimensions: { reductionName: [Float64Array, ...] }
 *   - matrix: scran sparse matrix (from first assay)
 */
export class SeuratDataset {
  #rds_file;
  #rds_handle;
  #converted_data;
  #options;

  // Public properties set by load(), accessed synchronously by explorer.worker.js
  cells = null;
  features = null;
  reduced_dimensions = null;
  matrix = null;

  constructor(rdsFile) {
    if (rdsFile instanceof SimpleFile) {
      this.#rds_file = rdsFile;
    } else {
      this.#rds_file = new SimpleFile(rdsFile);
    }
    this.#options = {};
  }

  async load() {
    try {
      console.log("[SeuratDataset] Starting load...");
      const buffer = await this.#rds_file.buffer();
      console.log("[SeuratDataset] Buffer loaded, size:", buffer.byteLength);
      console.log("[SeuratDataset] Buffer type:", buffer.constructor.name);

      // Ensure we have a Uint8Array
      let uint8Array;
      if (buffer instanceof Uint8Array) {
        uint8Array = buffer;
      } else if (buffer instanceof ArrayBuffer) {
        uint8Array = new Uint8Array(buffer);
      } else {
        throw new Error("Unexpected buffer type: " + buffer.constructor.name);
      }
      console.log("[SeuratDataset] Uint8Array created, length:", uint8Array.length);

      // Check first few bytes to see if it's gzip compressed
      const header = Array.from(uint8Array.slice(0, 10)).map(b => b.toString(16).padStart(2, '0')).join(' ');
      console.log("[SeuratDataset] First 10 bytes (hex):", header);

      // Check if file is gzip compressed (starts with 1f 8b)
      const isGzipped = uint8Array[0] === 0x1f && uint8Array[1] === 0x8b;
      console.log("[SeuratDataset] Is gzipped:", isGzipped);

      let decompressedData = uint8Array;
      if (isGzipped) {
        console.log("[SeuratDataset] Decompressing gzip data...");

        // Check compressed size and warn if too large
        const compressedSizeMB = (uint8Array.length / 1024 / 1024).toFixed(2);
        console.log(`[SeuratDataset] Compressed size: ${compressedSizeMB} MB`);

        // Estimate decompressed size (typically 3-10x for RDS files)
        const estimatedDecompressedMB = (uint8Array.length * 5 / 1024 / 1024).toFixed(2);
        console.log(`[SeuratDataset] Estimated decompressed size: ~${estimatedDecompressedMB} MB`);

        if (uint8Array.length > 500 * 1024 * 1024) { // > 500MB compressed
          throw new Error(
            `File is too large to process in browser (${compressedSizeMB} MB compressed, estimated ${estimatedDecompressedMB} MB decompressed). ` +
            `Please use DietSeurat() in R to create a smaller version with only essential data, or save with compress=FALSE for faster loading.`
          );
        }

        try {
          // Use DecompressionStream with ReadableStream
          const ds = new DecompressionStream('gzip');
          const writer = ds.writable.getWriter();
          writer.write(uint8Array);
          writer.close();

          const reader = ds.readable.getReader();
          const chunks = [];
          let totalLength = 0;

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            chunks.push(value);
            totalLength += value.length;

            // Check if decompressed size is getting too large
            if (totalLength > 1024 * 1024 * 1024) { // > 1GB
              throw new Error(
                `Decompressed file size exceeds browser memory limits (>${(totalLength / 1024 / 1024).toFixed(0)} MB). ` +
                `Please use DietSeurat() in R to reduce the file size.`
              );
            }
          }

          // Combine all chunks
          decompressedData = new Uint8Array(totalLength);
          let offset = 0;
          for (const chunk of chunks) {
            decompressedData.set(chunk, offset);
            offset += chunk.length;
          }

          console.log("[SeuratDataset] Decompressed size:", decompressedData.length, `(${(decompressedData.length / 1024 / 1024).toFixed(2)} MB)`);
        } catch (decompressError) {
          console.error("[SeuratDataset] Decompression failed:", decompressError);
          if (decompressError.message.includes("Array buffer allocation failed")) {
            throw new Error(
              "File is too large for browser memory. The decompressed size exceeds available memory. " +
              "Please use DietSeurat() in R to create a smaller version:\n\n" +
              "library(Seurat)\n" +
              "seurat_minimal <- DietSeurat(seurat_obj, counts=TRUE, data=TRUE, scale.data=FALSE)\n" +
              "saveRDS(seurat_minimal, 'seurat_minimal.rds')"
            );
          }
          throw new Error("Failed to decompress gzip data: " + decompressError.message);
        }
      }

      console.log("[SeuratDataset] Calling scran.readRds...");
      this.#rds_handle = scran.readRds(decompressedData);
      console.log("[SeuratDataset] RDS parsed successfully");

      if (!isSeuratObject(this.#rds_handle)) {
        throw new Error("RDS file does not contain a Seurat object");
      }
      console.log("[SeuratDataset] Confirmed Seurat object");

      this.#converted_data = convertSeuratToSCE(this.#rds_handle);
      console.log("[SeuratDataset] Conversion to SCE completed");

      // Build the synchronous properties expected by explorer.worker.js
      console.log("[SeuratDataset] Building cells DataFrame...");
      this.cells = this.#buildCellsDataFrame();
      console.log("[SeuratDataset] Building features map...");
      this.features = this.#buildFeaturesMap();
      console.log("[SeuratDataset] Building reduced dimensions...");
      this.reduced_dimensions = this.#buildReducedDimensions();
      console.log("[SeuratDataset] Building matrix...");
      this.matrix = this.#buildMatrix();

      console.log("[SeuratDataset] Load completed successfully");
      console.log("[SeuratDataset] Cells:", this.cells ? "OK" : "NULL");
      console.log("[SeuratDataset] Features:", this.features ? Object.keys(this.features) : "NULL");
      console.log("[SeuratDataset] Reduced dimensions:", this.reduced_dimensions ? Object.keys(this.reduced_dimensions) : "NULL");
      console.log("[SeuratDataset] Matrix:", this.matrix ? "OK" : "NULL");

      return this;
    } catch (e) {
      console.error("[SeuratDataset] Load failed:", e);
      console.error("[SeuratDataset] Error message:", e.message);
      console.error("[SeuratDataset] Stack trace:", e.stack);
      this.free();
      throw new Error("Failed to load Seurat object: " + e.message);
    }
  }

  async summary() {
    if (!this.#converted_data) {
      throw new Error("Dataset not loaded yet");
    }

    // Return structure compatible with bakana's H5adResult.summary()
    return {
      cells: this.cells || this.#buildCellsDataFrame(),
      modality_features: this.features || this.#buildFeaturesMap(),
      modality_assay_names: this.#getAssayNames(),
      reduced_dimension_names: Object.keys(this.#converted_data.reductions),
    };
  }

  // ── Build helpers (synchronous properties for the loaded dataset) ──

  #buildCellsDataFrame() {
    console.log("[SeuratDataset] Building cells DataFrame...");
    const metadata = this.#converted_data.metadata;
    const columns = {};
    for (const [key, values] of Object.entries(metadata)) {
      columns[key] = values;
    }
    console.log("[SeuratDataset] Metadata columns:", Object.keys(columns));

    let nCells = 0;
    const assays = Object.values(this.#converted_data.assays);
    console.log("[SeuratDataset] Number of assays:", assays.length);

    if (assays.length === 0) {
      console.warn("[SeuratDataset] No assays found, cannot determine cell count");
      // Try to get cell count from metadata
      const firstMetaCol = Object.values(metadata)[0];
      if (firstMetaCol && Array.isArray(firstMetaCol)) {
        nCells = firstMetaCol.length;
        console.log("[SeuratDataset] Cell count from metadata:", nCells);
      }
    } else {
      const firstAssay = assays[0];
      if (firstAssay && typeof firstAssay.numberOfColumns === "function") {
        nCells = firstAssay.numberOfColumns();
        console.log("[SeuratDataset] Cell count from assay:", nCells);
      }
    }

    if (nCells === 0) {
      console.error("[SeuratDataset] Could not determine cell count!");
    }

    const df = new bioc.DataFrame(columns, { numberOfRows: nCells });

    if (assays.length > 0) {
      const firstAssay = assays[0];
      if (firstAssay && typeof firstAssay.columnNames === "function") {
        const cellNames = firstAssay.columnNames();
        if (cellNames) {
          df.$setRowNames(cellNames);
          console.log("[SeuratDataset] Set row names from assay");
        }
      }
    }

    console.log("[SeuratDataset] DataFrame built successfully");
    return df;
  }

  #buildFeaturesMap() {
    const features = {};
    for (const [assayName, matrix] of Object.entries(this.#converted_data.assays)) {
      const featureNames = matrix.rowNames ? matrix.rowNames() : null;
      const nFeatures = matrix.numberOfRows ? matrix.numberOfRows() : 0;

      const df = new bioc.DataFrame({}, { numberOfRows: nFeatures });
      if (featureNames) {
        df.$setRowNames(featureNames);
      }
      features[assayName] = df;
    }
    return features;
  }

  #buildReducedDimensions() {
    const reductions = {};
    for (const [name, data] of Object.entries(this.#converted_data.reductions)) {
      const nCells = data.dimensions[0];
      const nDims = data.dimensions[1];
      const values = data.values;
      const reshaped = [];

      for (let d = 0; d < nDims; d++) {
        const col = new Float64Array(nCells);
        for (let c = 0; c < nCells; c++) {
          col[c] = values[c * nDims + d];
        }
        reshaped.push(col);
      }
      reductions[name] = reshaped;
    }
    return reductions;
  }

  #buildMatrix() {
    console.log("[SeuratDataset] Building MultiMatrix...");
    const multiMatrix = new scran.MultiMatrix();

    for (const [assayName, matrix] of Object.entries(this.#converted_data.assays)) {
      if (matrix) {
        // Map common Seurat assay names to standard modality names
        let modalityName = assayName;
        if (assayName.toLowerCase() === 'rna' || assayName.toLowerCase() === 'sct') {
          modalityName = 'RNA';
        } else if (assayName.toLowerCase() === 'adt' || assayName.toLowerCase() === 'antibody') {
          modalityName = 'ADT';
        } else if (assayName.toLowerCase() === 'crispr') {
          modalityName = 'CRISPR';
        }

        console.log(`[SeuratDataset] Adding assay '${assayName}' as modality '${modalityName}'`);
        multiMatrix.add(modalityName, matrix);
      }
    }

    console.log("[SeuratDataset] MultiMatrix built with modalities:", multiMatrix.available());
    return multiMatrix;
  }

  #getAssayNames() {
    const assayNames = {};
    for (const assayName of Object.keys(this.#converted_data.assays)) {
      assayNames[assayName] = ["counts", "data"];
    }
    return assayNames;
  }

  // ── Public interface ──

  options() {
    return this.#options;
  }

  setOptions(options) {
    this.#options = options;
  }

  clear() {
    // Called by explorer.worker.js when cleaning up preflights
    this.free();
  }

  free() {
    if (this.#rds_handle) {
      scran.free(this.#rds_handle);
      this.#rds_handle = null;
    }
    if (this.#converted_data && this.#converted_data.assays) {
      for (const m of Object.values(this.#converted_data.assays)) {
        if (m && typeof m.free === "function") {
          m.free();
        }
      }
    }
    this.cells = null;
    this.features = null;
    this.reduced_dimensions = null;
    this.matrix = null;
    this.#converted_data = null;
  }

  serialize(handle) {
    return { format: "Seurat", file: this.#rds_file };
  }
}
