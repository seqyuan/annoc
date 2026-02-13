import * as scran from "scran.js";
import * as bioc from "bioconductor";

/**
 * Seurat RDS reader that converts Seurat v4 objects to bakana-compatible format
 * This reader extracts:
 * - Expression matrices (counts, data)
 * - Dimensionality reductions (PCA, UMAP, t-SNE)
 * - Cell metadata (meta.data)
 * - Gene/feature names
 *
 * Note: Seurat-specific graphs/neighbors are NOT extracted
 */

/**
 * Check if the RDS object is a Seurat object
 */
function isSeuratObject(handle) {
    if (!(handle instanceof scran.RdsS4Object)) {
        return false;
    }

    const className = handle.className();
    const packageName = handle.packageName();

    return className === "Seurat" && packageName === "SeuratObject";
}

/**
 * Extract assay data from Seurat object
 * Seurat structure: @assays$RNA@counts, @assays$RNA@data
 */
function extractSeuratAssays(handle) {
    const assays = {};

    try {
        // Get @assays slot
        const assaysHandle = handle.attribute("assays");
        if (!(assaysHandle instanceof scran.RdsGenericVector)) {
            throw new Error("assays slot should be a generic list");
        }

        // Get assay names
        const assayNamesIdx = assaysHandle.findAttribute("names");
        if (assayNamesIdx < 0) {
            throw new Error("assays list should be named");
        }

        const assayNamesHandle = assaysHandle.attribute(assayNamesIdx);
        const assayNames = assayNamesHandle.values();
        scran.free(assayNamesHandle);

        // Extract each assay (typically RNA, ADT, etc.)
        for (let i = 0; i < assayNames.length; i++) {
            const assayName = assayNames[i];
            const assayHandle = assaysHandle.load(i);

            try {
                // Get counts matrix (@counts slot)
                const countsIdx = assayHandle.findAttribute("counts");
                if (countsIdx >= 0) {
                    const countsHandle = assayHandle.attribute(countsIdx);
                    assays[assayName] = {
                        counts: countsHandle,
                        name: assayName
                    };
                }

                // Get normalized data (@data slot)
                const dataIdx = assayHandle.findAttribute("data");
                if (dataIdx >= 0) {
                    const dataHandle = assayHandle.attribute(dataIdx);
                    if (!assays[assayName]) {
                        assays[assayName] = {};
                    }
                    assays[assayName].data = dataHandle;
                }
            } finally {
                scran.free(assayHandle);
            }
        }

        scran.free(assaysHandle);
    } catch (e) {
        throw new Error("failed to extract Seurat assays; " + e.message);
    }

    return assays;
}

/**
 * Extract dimensionality reductions from Seurat object
 * Seurat structure: @reductions$pca@cell.embeddings
 */
function extractSeuratReductions(handle) {
    const reductions = {};

    try {
        const reductionsIdx = handle.findAttribute("reductions");
        if (reductionsIdx < 0) {
            return reductions; // No reductions available
        }

        const reductionsHandle = handle.attribute(reductionsIdx);
        if (!(reductionsHandle instanceof scran.RdsGenericVector)) {
            scran.free(reductionsHandle);
            return reductions;
        }

        // Get reduction names
        const redNamesIdx = reductionsHandle.findAttribute("names");
        if (redNamesIdx >= 0) {
            const redNamesHandle = reductionsHandle.attribute(redNamesIdx);
            const redNames = redNamesHandle.values();
            scran.free(redNamesHandle);

            // Extract each reduction
            for (let i = 0; i < redNames.length; i++) {
                const redName = redNames[i];
                const redHandle = reductionsHandle.load(i);

                try {
                    // Get cell.embeddings slot
                    const embeddingsIdx = redHandle.findAttribute("cell.embeddings");
                    if (embeddingsIdx >= 0) {
                        const embeddingsHandle = redHandle.attribute(embeddingsIdx);
                        // Convert to uppercase for consistency (pca -> PCA)
                        reductions[redName.toUpperCase()] = embeddingsHandle;
                    }
                } finally {
                    scran.free(redHandle);
                }
            }
        }

        scran.free(reductionsHandle);
    } catch (e) {
        throw new Error("failed to extract Seurat reductions; " + e.message);
    }

    return reductions;
}

/**
 * Extract cell metadata from Seurat object
 * Seurat structure: @meta.data (data.frame)
 */
function extractSeuratMetadata(handle) {
    try {
        const metaIdx = handle.findAttribute("meta.data");
        if (metaIdx < 0) {
            return null;
        }

        const metaHandle = handle.attribute(metaIdx);

        // Convert data.frame to bioc.DataFrame format
        const columns = {};
        const colNames = [];

        // Extract column names
        const namesIdx = metaHandle.findAttribute("names");
        if (namesIdx >= 0) {
            const namesHandle = metaHandle.attribute(namesIdx);
            const names = namesHandle.values();
            colNames.push(...names);
            scran.free(namesHandle);
        }

        // Extract each column
        for (let i = 0; i < colNames.length; i++) {
            const colHandle = metaHandle.load(i);
            if (colHandle instanceof scran.RdsVector) {
                columns[colNames[i]] = colHandle.values();
            }
            scran.free(colHandle);
        }

        // Get row names (cell barcodes)
        let rowNames = null;
        const rowNamesIdx = metaHandle.findAttribute("row.names");
        if (rowNamesIdx >= 0) {
            const rowNamesHandle = metaHandle.attribute(rowNamesIdx);
            if (rowNamesHandle instanceof scran.RdsStringVector) {
                rowNames = rowNamesHandle.values();
            }
            scran.free(rowNamesHandle);
        }

        scran.free(metaHandle);

        return new bioc.DataFrame(columns, {
            columnOrder: colNames,
            rowNames: rowNames
        });
    } catch (e) {
        throw new Error("failed to extract Seurat metadata; " + e.message);
    }
}

/**
 * Main class for reading Seurat RDS files
 */
export class SeuratDataset {
    #rds_file;
    #rds_handle;
    #seurat_handle;

    constructor(file, options = {}) {
        this.#rds_file = file;
        this.#rds_handle = null;
        this.#seurat_handle = null;
    }

    async load() {
        try {
            // Load RDS file
            this.#rds_handle = await scran.readRds(this.#rds_file);
            this.#seurat_handle = this.#rds_handle.value();

            // Verify it's a Seurat object
            if (!isSeuratObject(this.#seurat_handle)) {
                throw new Error("RDS file does not contain a Seurat object");
            }

            return true;
        } catch (e) {
            this.free();
            throw new Error("failed to load Seurat RDS file; " + e.message);
        }
    }

    /**
     * Get summary information about the Seurat object
     * Returns format compatible with bakana's expectations
     */
    summary() {
        if (!this.#seurat_handle) {
            throw new Error("Seurat object not loaded");
        }

        const assays = extractSeuratAssays(this.#seurat_handle);
        const reductions = extractSeuratReductions(this.#seurat_handle);
        const metadata = extractSeuratMetadata(this.#seurat_handle);

        return {
            format: "Seurat",
            assays: Object.keys(assays),
            reductions: Object.keys(reductions),
            cells: metadata || new bioc.DataFrame({}),
            metadata_columns: metadata ? metadata.columnNames() : []
        };
    }

    /**
     * Convert to bakana-compatible format
     */
    toBakanaFormat() {
        if (!this.#seurat_handle) {
            throw new Error("Seurat object not loaded");
        }

        const assays = extractSeuratAssays(this.#seurat_handle);
        const reductions = extractSeuratReductions(this.#seurat_handle);
        const metadata = extractSeuratMetadata(this.#seurat_handle);

        return {
            assays,
            reductions,
            metadata,
            format: "seurat"
        };
    }

    free() {
        if (this.#rds_handle) {
            scran.free(this.#rds_handle);
            this.#rds_handle = null;
        }
        this.#seurat_handle = null;
    }

    static format() {
        return "Seurat";
    }
}
