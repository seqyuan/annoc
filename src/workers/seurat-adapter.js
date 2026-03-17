import * as scran from "scran.js";

/**
 * Check if an RDS object is a Seurat object
 */
export function isSeuratObject(handle) {
  console.log("[isSeuratObject] Checking handle type:", handle?.constructor?.name);

  if (!(handle instanceof scran.RdsS4Object)) {
    console.log("[isSeuratObject] Not an RdsS4Object");
    return false;
  }

  const className = handle.className();
  const packageName = handle.packageName();
  console.log("[isSeuratObject] Class:", className, "Package:", packageName);

  // Check for Seurat v3/v4/v5
  const isSeurat = (className === "Seurat" && packageName === "SeuratObject") ||
         (className === "Seurat" && packageName === "Seurat");

  console.log("[isSeuratObject] Is Seurat:", isSeurat);
  return isSeurat;
}

/**
 * Extract assay data from Seurat object
 * Only extracts 'data' slot (normalized data) to reduce memory usage
 */
function extractSeuratAssays(seuratHandle) {
  console.log("[extractSeuratAssays] Starting assay extraction...");
  const assays = {};

  try {
    // Get @assays slot
    const assaysHandle = seuratHandle.attribute("assays");
    if (!assaysHandle) {
      throw new Error("No assays found in Seurat object");
    }
    console.log("[extractSeuratAssays] Assays handle obtained");

    // Seurat stores assays as a list
    if (assaysHandle instanceof scran.RdsGenericVector) {
      const assayNames = [];
      const namesIdx = assaysHandle.findAttribute("names");
      if (namesIdx >= 0) {
        const namesHandle = assaysHandle.attribute(namesIdx);
        const names = namesHandle.values();
        assayNames.push(...names);
        console.log("[extractSeuratAssays] Found assays:", assayNames);
        scran.free(namesHandle);
      }

      // Extract each assay
      for (let i = 0; i < assaysHandle.length(); i++) {
        const assayHandle = assaysHandle.load(i);
        const assayName = assayNames[i] || `assay_${i}`;
        console.log(`[extractSeuratAssays] Processing assay: ${assayName}`);

        try {
          // Seurat v3/v4/v5 slots: @counts, @data, @scale.data
          // Priority: data > counts (to save memory)
          // 'data' is normalized and usually smaller than 'counts'
          let matrixHandle = null;
          let slotUsed = null;

          // Try to get 'data' slot first (normalized data)
          const dataIdx = assayHandle.findAttribute("data");
          if (dataIdx >= 0) {
            matrixHandle = assayHandle.attribute(dataIdx);
            slotUsed = "data";
            console.log(`[extractSeuratAssays] Using 'data' slot for ${assayName}`);
          }

          // Fallback to 'counts' if 'data' is not available
          if (!matrixHandle) {
            const countsIdx = assayHandle.findAttribute("counts");
            if (countsIdx >= 0) {
              matrixHandle = assayHandle.attribute(countsIdx);
              slotUsed = "counts";
              console.log(`[extractSeuratAssays] Using 'counts' slot for ${assayName} (data not available)`);
            }
          }

          if (matrixHandle) {
            // Convert to scran matrix
            console.log(`[extractSeuratAssays] Converting ${assayName} (${slotUsed}) to scran matrix...`);
            const matrix = scran.initializeSparseMatrixFromRds(matrixHandle, { forceInteger: false });
            assays[assayName] = matrix;
            console.log(`[extractSeuratAssays] ${assayName} converted successfully`);
            scran.free(matrixHandle);
          } else {
            console.warn(`Assay ${assayName} does not have 'data' or 'counts' slot.`);
          }
        } catch (e) {
          console.warn(`Failed to extract assay ${assayName}:`, e);
        } finally {
          scran.free(assayHandle);
        }
      }
    }

    scran.free(assaysHandle);
  } catch (e) {
    console.error("Error extracting Seurat assays:", e);
  }

  console.log("[extractSeuratAssays] Extraction complete. Assays:", Object.keys(assays));
  return assays;
}

/**
 * Extract metadata from Seurat object
 */
function extractSeuratMetadata(seuratHandle) {
  console.log("[extractSeuratMetadata] Starting metadata extraction...");
  const metadata = {};

  try {
    // Get @meta.data slot
    const metaIdx = seuratHandle.findAttribute("meta.data");
    if (metaIdx >= 0) {
      const metaHandle = seuratHandle.attribute(metaIdx);
      console.log("[extractSeuratMetadata] meta.data handle obtained");

      // meta.data is a data.frame
      if (metaHandle instanceof scran.RdsGenericVector) {
        const colNames = [];
        const namesIdx = metaHandle.findAttribute("names");
        if (namesIdx >= 0) {
          const namesHandle = metaHandle.attribute(namesIdx);
          colNames.push(...namesHandle.values());
          console.log("[extractSeuratMetadata] Found columns:", colNames);
          scran.free(namesHandle);
        }

        // Extract each column
        for (let i = 0; i < metaHandle.length(); i++) {
          const colHandle = metaHandle.load(i);
          const colName = colNames[i] || `col_${i}`;

          try {
            if (colHandle instanceof scran.RdsIntegerVector ||
                colHandle instanceof scran.RdsDoubleVector ||
                colHandle instanceof scran.RdsStringVector) {
              metadata[colName] = colHandle.values();
              console.log(`[extractSeuratMetadata] Extracted column: ${colName}`);
            }
          } catch (e) {
            console.warn(`Failed to extract metadata column ${colName}:`, e);
          } finally {
            scran.free(colHandle);
          }
        }
      }

      scran.free(metaHandle);
    } else {
      console.warn("[extractSeuratMetadata] No meta.data slot found");
    }
  } catch (e) {
    console.error("Error extracting Seurat metadata:", e);
  }

  console.log("[extractSeuratMetadata] Extraction complete. Columns:", Object.keys(metadata));
  return metadata;
}

/**
 * Extract dimensionality reductions from Seurat object
 */
function extractSeuratReductions(seuratHandle) {
  console.log("[extractSeuratReductions] Starting reductions extraction...");
  const reductions = {};

  try {
    // Get @reductions slot
    const reductionsIdx = seuratHandle.findAttribute("reductions");
    if (reductionsIdx >= 0) {
      const reductionsHandle = seuratHandle.attribute(reductionsIdx);
      console.log("[extractSeuratReductions] reductions handle obtained");

      if (reductionsHandle instanceof scran.RdsGenericVector) {
        const redNames = [];
        const namesIdx = reductionsHandle.findAttribute("names");
        if (namesIdx >= 0) {
          const namesHandle = reductionsHandle.attribute(namesIdx);
          redNames.push(...namesHandle.values());
          console.log("[extractSeuratReductions] Found reductions:", redNames);
          scran.free(namesHandle);
        }

        // Extract each reduction
        for (let i = 0; i < reductionsHandle.length(); i++) {
          const redHandle = reductionsHandle.load(i);
          const redName = redNames[i] || `reduction_${i}`;
          console.log(`[extractSeuratReductions] Processing reduction: ${redName}`);

          try {
            // Get @cell.embeddings slot
            const embIdx = redHandle.findAttribute("cell.embeddings");
            if (embIdx >= 0) {
              const embHandle = redHandle.attribute(embIdx);

              // Extract matrix values
              if (embHandle instanceof scran.RdsDoubleVector ||
                  embHandle instanceof scran.RdsIntegerVector) {
                const dimIdx = embHandle.findAttribute("dim");
                if (dimIdx >= 0) {
                  const dimHandle = embHandle.attribute(dimIdx);
                  const dims = dimHandle.values();
                  const values = embHandle.values();

                  console.log(`[extractSeuratReductions] ${redName} dimensions:`, dims);
                  reductions[redName] = {
                    values: values,
                    dimensions: dims
                  };

                  scran.free(dimHandle);
                }
              }

              scran.free(embHandle);
            } else {
              console.warn(`[extractSeuratReductions] ${redName} has no cell.embeddings slot`);
            }
          } catch (e) {
            console.warn(`Failed to extract reduction ${redName}:`, e);
          } finally {
            scran.free(redHandle);
          }
        }
      }

      scran.free(reductionsHandle);
    } else {
      console.warn("[extractSeuratReductions] No reductions slot found");
    }
  } catch (e) {
    console.error("Error extracting Seurat reductions:", e);
  }

  console.log("[extractSeuratReductions] Extraction complete. Reductions:", Object.keys(reductions));
  return reductions;
}

/**
 * Convert Seurat object to SCE-compatible structure
 */
export function convertSeuratToSCE(seuratHandle) {
  console.log("Converting Seurat object to SCE format...");

  const result = {
    assays: {},
    metadata: {},
    reductions: {},
    features: null
  };

  try {
    // Extract assays
    result.assays = extractSeuratAssays(seuratHandle);
    console.log("Extracted assays:", Object.keys(result.assays));

    // Extract metadata
    result.metadata = extractSeuratMetadata(seuratHandle);
    console.log("Extracted metadata columns:", Object.keys(result.metadata));

    // Extract reductions
    result.reductions = extractSeuratReductions(seuratHandle);
    console.log("Extracted reductions:", Object.keys(result.reductions));

    // Extract feature names from first assay
    if (Object.keys(result.assays).length > 0) {
      const firstAssay = Object.values(result.assays)[0];
      if (firstAssay && typeof firstAssay.rowNames === 'function') {
        result.features = firstAssay.rowNames();
      }
    }

  } catch (e) {
    console.error("Error converting Seurat to SCE:", e);
    throw e;
  }

  return result;
}
