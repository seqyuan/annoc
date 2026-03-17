import * as bakana from "bakana";
import * as scran from "scran.js";
import * as downloads from "./DownloadsDBHandler.js";
import {
  extractBuffers,
  postAttempt,
  postSuccess,
  postError,
  describeColumn,
  isArrayOrView,
} from "./helpers.js";
import { code } from "../utils/utils.js";
import { isSeuratObject, convertSeuratToSCE } from "./seurat-adapter.js";
import { SeuratDataset } from "./SeuratDataset.js";
/***************************************/

const default_cluster = `${code}::CLUSTERS`;
const default_selection = `${code}::SELECTION`;

let superstate = null;
let preflights = {};
let preflights_summary = {};
let dataset = null;
let cache_anno_markers = {};
let custom_selection_state = null;
let feature_set_enrich_state = null;
let cell_labelling_state = null;
let custom_annotations_state = {};
let subcluster_results = {};

function createDataset(args, setOpts = false) {
  if (args.format === "H5AD") {
    return new bakana.H5adResult(args.h5, setOpts ? args.options : {});
  } else if (args.format === "SummarizedExperiment") {
    return new bakana.SummarizedExperimentResult(
      args.rds,
      setOpts ? args.options : {}
    );
  } else if (args.format === "Seurat") {
    // Use custom SeuratDataset for native Seurat objects
    const dataset = new SeuratDataset(args.rds);
    if (setOpts) {
      dataset.setOptions(args.options);
    }
    return dataset;
  } else if (args.format === "ZippedArtifactdb") {
    return new bakana.ZippedArtifactdbResult(
      args.zipname,
      new bakana.SimpleFile(args.zipfile),
      setOpts ? args.options : {}
    );
  } else {
    throw new Error("unknown format '" + args.format + "'");
  }
}

function summarizeResult(summary, args) {
  // TODO: figure out a way to deal with nested objects later
  let cells_summary = {};
  for (const k of summary.cells.columnNames()) {
    const kcol = summary.cells.column(k);
    if (isArrayOrView(kcol))
      cells_summary[k] = describeColumn(kcol, { all: true, colname: k });
  }
  let tmp_meta = {
    cells: {
      columns: cells_summary,
      numberOfCells: summary.cells.numberOfRows(),
    },
  };

  if (
    args.format === "SummarizedExperiment" ||
    args.format === "Seurat" ||
    args.format === "ZippedArtifactdb"
  ) {
    tmp_meta["modality_features"] = {};
    if ("modality_features" in summary) {
      for (const [k, v] of Object.entries(summary.modality_features)) {
        let tmod_summary = {};
        for (const k of v.columnNames()) {
          const kcol = v.column(k);
          if (isArrayOrView(kcol)) {
            tmod_summary[k] = describeColumn(kcol, { all: true, colname: k });
          }
        }
        tmp_meta["modality_features"][k] = {
          columns: tmod_summary,
          numberOfFeatures: v.numberOfRows(),
          rownames: Array.isArray(v.rowNames()),
        };
      }
    }
  } else {
    tmp_meta["all_features"] = {};
    let tmod_summary = {};
    for (const k of summary["all_features"].columnNames()) {
      const kcol = summary["all_features"].column(k);
      if (isArrayOrView(kcol)) {
        tmod_summary[k] = describeColumn(kcol, { all: true, colname: k });
      }
    }
    tmp_meta["all_features"] = {
      columns: tmod_summary,
      numberOfFeatures: summary["all_features"].numberOfRows(),
      rownames: Array.isArray(summary["all_features"].rowNames()),
    };
  }

  if (args.format === "H5AD") {
    tmp_meta["all_assay_names"] = summary.all_assay_names;
  } else if (
    args.format === "SummarizedExperiment" ||
    args.format === "Seurat" ||
    args.format === "ZippedArtifactdb"
  ) {
    tmp_meta["modality_assay_names"] = summary.modality_assay_names;
  }

  tmp_meta.reduced_dimension_names = summary.reduced_dimension_names;

  // Add Seurat-specific fields for SeuratCard
  if (args.format === "Seurat") {
    // Add flattened fields for SeuratCard while keeping the original structure
    tmp_meta.cells_count = tmp_meta.cells.numberOfCells;
    tmp_meta.assays = Object.keys(summary.modality_assay_names || {});
    tmp_meta.reductions = summary.reduced_dimension_names || [];
    tmp_meta.metadata_columns = Object.keys(cells_summary);
  }

  return tmp_meta;
}

function getMarkerStandAloneForAnnot(annotation, annotation_vec) {
  let mds;
  if (!(annotation in cache_anno_markers)) {
    mds = new bakana.MarkerDetectionStandalone(
      getMatrix(),
      annotation_vec.ids.slice()
    );

    mds.computeAll();
    cache_anno_markers[annotation] = mds;
  }

  return cache_anno_markers[annotation];
}

const getAnnotation = (annotation) => {
  if (annotation.indexOf(":::") !== -1) {
    let splits = annotation.split(":::");
    return dataset.cells.column(splits[0]).column(splits[1]);
  }
  return dataset.cells.column(annotation);
};

const getMatrix = () => {
  return dataset.matrix;
};

function getAnnotationLabels(annotation) {
  if (subcluster_results[annotation]) {
    return subcluster_results[annotation].labels;
  }
  if (custom_annotations_state[annotation]) {
    const c = custom_annotations_state[annotation];
    const sourceVec = getAnnotation(c.sourceAnnotation);
    let sourceLabels;
    if (ArrayBuffer.isView(sourceVec)) sourceLabels = Array.from(sourceVec);
    else sourceLabels = Array.from(sourceVec);
    return sourceLabels.map((cluster) => c.annotations[String(cluster)] ?? String(cluster));
  }
  const vec = getAnnotation(annotation);
  const factorized = scran.factorize(vec);
  const levels = factorized.levels;
  let ids = factorized.ids;
  if (ids && typeof ids.array === "function") ids = ids.array();
  ids = Array.from(ids);
  return ids.map((i) => (levels[i] != null ? String(levels[i]) : ""));
}

/***************************************/

var loaded;
onmessage = function (msg) {
  const { type, payload } = msg.data;

  // console.log("EXPLORE WORKER::RCV::", type, payload);

  let fatal = false;
  if (type === "INIT") {
    fatal = true;
    let nthreads = Math.round((navigator.hardwareConcurrency * 2) / 3);
    let back_init = bakana.initialize({ numberOfThreads: nthreads });

    let state_init = back_init.then(() => {
      return bakana.createAnalysis();
    });

    state_init.then((x) => {
      superstate = x;
      postMessage({
        type: type,
        msg: "Success: analysis state created",
      });
    });

    let down_init = downloads.initialize();
    down_init
      .then((output) => {
        postMessage({
          type: "DownloadsDB_store",
          resp: output,
          msg: "Success: DownloadsDB initialized",
        });
      })
      .catch((error) => {
        console.error(error);
        postMessage({
          type: "DownloadsDB_ERROR",
          msg: "Error: Cannot initialize DownloadsDB",
        });
      });

    loaded = Promise.all([back_init, state_init, down_init]);

    loaded
      .then(() => {
        postMessage({
          type: type,
          msg: "Success: bakana initialized",
        });
      })
      .catch((err) => {
        console.error(err);
        postError(type, err, fatal);
      });
    /**************** EXPLORE AN ANALYSIS *******************/
  } else if (type === "EXPLORE") {
    fatal = true;
    loaded
      .then(async (x) => {
        console.log("[EXPLORE] Starting exploration...");
        let inputs = payload.inputs;
        let files = inputs.files;

        if (files !== null) {
          console.log("[EXPLORE] Files to process:", Object.keys(files));
          // Extracting existing datasets from the preflights.
          let current = {};
          for (const [k, v] of Object.entries(files)) {
            console.log(`[EXPLORE] Processing file: ${k}, format: ${v.format}`);
            if ("uid" in v && v.uid in preflights) {
              preflights[v.uid].clear();
              delete preflights[k];
            }
            current[k] = createDataset(v, true);
            current[k].setOptions(v.options);
          }

          for (const [k, v] of Object.entries(current)) {
            console.log(`[EXPLORE] Loading dataset: ${k}`);
            dataset = await v.load();
            console.log(`[EXPLORE] Dataset loaded successfully: ${k}`);

            let finput = files[k];

            let step_inputs = "inputs";
            postAttempt(step_inputs);

            console.log("[EXPLORE] Extracting cell annotations...");
            // extract cell annotations
            let annotation_keys = {};
            for (const k of dataset.cells.columnNames()) {
              let kcol = dataset.cells.column(k);
              if (isArrayOrView(kcol)) {
                const ksumm = describeColumn(kcol, {
                  all: false,
                  unique: true,
                  colname: k,
                });
                annotation_keys[k] = ksumm;
              }
            }
            console.log("[EXPLORE] Cell annotations extracted:", Object.keys(annotation_keys));

            let step_inputs_resp = {
              annotations: annotation_keys,
              genes: {},
              num_cells: dataset.cells.numberOfRows(),
              num_genes: {},
            };

            console.log("[EXPLORE] Extracting features...");
            for (const [k, v] of Object.entries(dataset.features)) {
              step_inputs_resp["genes"][k] = {};
              step_inputs_resp["num_genes"][k] = v.numberOfRows();
              for (const col of v.columnNames()) {
                let kcol = v.column(col);
                if (isArrayOrView(kcol)) {
                  step_inputs_resp["genes"][k][col] = kcol;
                }
              }

              if (v.rowNames()) {
                step_inputs_resp["genes"][k]["rowNames"] = v.rowNames();
              }
            }
            postSuccess(step_inputs, step_inputs_resp);

            let step_embed = "embedding";
            postAttempt(step_embed);
            let step_embed_resp = {};

            for (const [k, v] of Object.entries(dataset.reduced_dimensions)) {
              if (k.toLowerCase() !== "pca") {
                // Support any dimension (2D, 3D, etc.) for compatibility with spatial and other embeddings
                const dims = v.length; // Number of dimensions
                step_embed_resp[k] = {
                  x: v[0].slice(),
                  y: v[1].slice(),
                  ...(dims > 2 ? { z: v[2].slice() } : {}), // Include z if 3D or more
                };
              }
            }

            postSuccess(step_embed, step_embed_resp);

            if (custom_selection_state) {
              custom_selection_state.free();
            }

            custom_selection_state = new bakana.CustomSelectionsStandalone(
              dataset.matrix
            );
          }
        }
      })
      .catch((err) => {
        console.error(err);
        postError(type, err, fatal);
      });
    /**************** LOADING EXISTING ANALYSES *******************/
  } else if (type === "PREFLIGHT_INPUT") {
    loaded
      .then(async (x) => {
        let resp = {};
        try {
          // Registering the UIDs of each new dataset.
          let current = {};
          let summary = {};
          for (const [k, v] of Object.entries(payload.inputs.files)) {
            if ("uid" in v) {
              if (!(v.uid in preflights)) {
                preflights[v.uid] = createDataset(v);
                // For Seurat datasets, we need to load before calling summary
                if (v.format === "Seurat") {
                  await preflights[v.uid].load();
                }
                preflights_summary[v.uid] = await preflights[v.uid].summary();
              }
              current[k] = preflights[v.uid];
              summary[k] = summarizeResult(preflights_summary[v.uid], v);
            } else {
              let tmp_dataset = createDataset(v);
              // For Seurat datasets, we need to load before calling summary
              if (v.format === "Seurat") {
                await tmp_dataset.load();
              }
              let tmp_summary = await tmp_dataset.summary();
              current[k] = tmp_dataset;
              summary[k] = summarizeResult(tmp_summary, v);
            }
          }

          resp.status = "SUCCESS";
          resp.details = summary;
        } catch (e) {
          console.error(e);
          resp.status = "ERROR";
          resp.reason = e.toString();
        }

        postMessage({
          type: "PREFLIGHT_INPUT_DATA",
          resp: resp,
          msg: "Success: PREFLIGHT_INPUT done",
        });
      })
      .catch((err) => {
        console.error(err);
        postError(type, err, fatal);
      });

    /**************** VERSUS MODE *******************/
  } else if (type === "computeVersusClusters") {
    loaded
      .then((x) => {
        let rank_type = payload.rank_type;
        let modality = payload.modality;
        let annotation = payload.annotation;

        let annotation_vec = scran.factorize(getAnnotation(annotation));

        let mds = getMarkerStandAloneForAnnot(annotation, annotation_vec);
        let raw_res = mds.computeVersus(
          annotation_vec.levels.indexOf(payload.left),
          annotation_vec.levels.indexOf(payload.right)
        );
        let resp = bakana.formatMarkerResults(
          raw_res.results[modality],
          raw_res.left,
          rank_type
        );

        var transferrable = [];
        extractBuffers(resp, transferrable);
        postMessage(
          {
            type: "computeVersusClusters",
            resp: resp,
            msg: "Success: COMPUTE_VERSUS_CLUSTERS done",
          },
          transferrable
        );
      })
      .catch((err) => {
        console.error(err);
        postError(type, err, fatal);
      });
  } else if (type === "computeVersusSelections") {
    loaded
      .then((x) => {
        let rank_type = payload.rank_type;
        let res = custom_selection_state.computeVersus(
          payload.left,
          payload.right
        );
        let resp = bakana.formatMarkerResults(
          res["results"][payload.modality],
          payload.left,
          rank_type
        );

        var transferrable = [];
        extractBuffers(resp, transferrable);
        postMessage(
          {
            type: "computeVersusSelections",
            resp: resp,
            msg: "Success: COMPUTE_VERSUS_SELECTIONS done",
          },
          transferrable
        );
      })
      .catch((err) => {
        console.error(err);
        postError(type, err, fatal);
      });

    //   /**************** OTHER EVENTS FROM UI *******************/
  } else if (type === "getMarkersForCluster") {
    loaded
      .then((x) => {
        let cluster = payload.cluster;
        let rank_type = payload.rank_type;
        let modality = payload.modality;
        let annotation = payload.annotation;

        let annotation_vec = scran.factorize(getAnnotation(annotation));
        let mds = getMarkerStandAloneForAnnot(annotation, annotation_vec);

        let raw_res = mds.fetchResults()[modality];

        let resp = bakana.formatMarkerResults(
          raw_res,
          annotation_vec.levels.indexOf(cluster),
          rank_type
        );

        var transferrable = [];
        extractBuffers(resp, transferrable);
        postMessage(
          {
            type: "setMarkersForCluster",
            resp: resp,
            msg: "Success: GET_MARKER_GENE done",
          },
          transferrable
        );
      })
      .catch((err) => {
        console.error(err);
        postError(type, err, fatal);
      });
  } else if (type === "getGeneExpression") {
    loaded
      .then((x) => {
        let row_idx = payload.gene;
        let modality = payload.modality;

        var vec = dataset.matrix.get(modality).row(row_idx);

        postMessage(
          {
            type: "setGeneExpression",
            resp: {
              gene: row_idx,
              expr: vec,
            },
            msg: "Success: GET_GENE_EXPRESSION done",
          },
          [vec.buffer]
        );
      })
      .catch((err) => {
        console.error(err);
        postError(type, err, fatal);
      });
  } else if (type === "computeCustomMarkers") {
    loaded
      .then((x) => {
        custom_selection_state.addSelection(payload.id, payload.selection);
        postMessage({
          type: "computeCustomMarkers",
          msg: "Success: COMPUTE_CUSTOM_MARKERS done",
        });
      })
      .catch((err) => {
        console.error(err);
        postError(type, err, fatal);
      });
  } else if (type === "getMarkersForSelection") {
    loaded
      .then((x) => {
        let rank_type = payload.rank_type;

        let raw_res = custom_selection_state.fetchResults(payload.cluster)[
          payload.modality
        ];
        let resp = bakana.formatMarkerResults(raw_res, 1, rank_type);

        var transferrable = [];
        extractBuffers(resp, transferrable);
        postMessage(
          {
            type: "setMarkersForCustomSelection",
            resp: resp,
            msg: "Success: GET_MARKER_GENE done",
          },
          transferrable
        );
      })
      .catch((err) => {
        console.error(err);
        postError(type, err, fatal);
      });
  } else if (type === "removeCustomMarkers") {
    loaded
      .then((x) => {
        custom_selection_state.removeSelection(payload.id);
      })
      .catch((err) => {
        console.error(err);
        postError(type, err, fatal);
      });
  } else if (type === "downloadAllSelections") {
    loaded
      .then(async (x) => {
        const selections = payload.selections || {};
        const entries = Object.entries(selections);
        if (entries.length === 0) {
          postError(type, new Error("No selections to download"), false);
          return;
        }
        const result = [];
        if (dataset?.cells) {
          const rowNames = dataset.cells.rowNames?.() || null;
          if (!rowNames) {
            postError(type, new Error("Dataset has no cell barcodes"), false);
            return;
          }
          for (const [name, indices] of entries) {
            const idxArr = Array.isArray(indices) ? indices : Array.from(indices || []);
            const barcodes = idxArr.map((i) =>
              i >= 0 && i < rowNames.length ? String(rowNames[i]) : ""
            );
            result.push({ name, barcodes });
          }
        } else {
          postError(type, new Error("Dataset not loaded"), false);
          return;
        }
        postMessage({
          type: "downloadAllSelections_DATA",
          resp: { selections: result },
          msg: "Success: DOWNLOAD_ALL_SELECTIONS done",
        });
      })
      .catch((err) => {
        console.error(err);
        postError(type, err, false);
      });
  } else if (type === "getAnnotation") {
    loaded
      .then((x) => {
        let annot = payload.annotation;
        let vec, output;

        // Check if this is a subcluster result
        if (subcluster_results[annot]) {
          const labels = subcluster_results[annot].labels;
          const uniq_vals = [];
          const uniq_map = {};
          const indices = new Int32Array(labels.length);
          for (let i = 0; i < labels.length; i++) {
            const lab = labels[i] != null ? String(labels[i]) : "";
            if (lab && !(lab in uniq_map)) {
              uniq_map[lab] = uniq_vals.length;
              uniq_vals.push(lab);
            }
            indices[i] = lab in uniq_map ? uniq_map[lab] : -1;
          }
          output = {
            type: "factor",
            index: indices,
            levels: uniq_vals,
          };
        } else if (custom_annotations_state[annot]) {
          const customAnnotation = custom_annotations_state[annot];
          const sourceAnnotation = customAnnotation.sourceAnnotation;
          const annotations = customAnnotation.annotations;

          // Get the source annotation data
          const sourceVec = getAnnotation(sourceAnnotation);

          // Map source clusters to custom annotations
          if (ArrayBuffer.isView(sourceVec)) {
            // For array type
            const annotationValues = Array.from(sourceVec).map((cluster) => {
              return annotations[String(cluster)] || "";
            });

            output = {
              type: "array",
              values: annotationValues,
            };
          } else {
            // For factor type
            const annotationValues = sourceVec.map((cluster) => {
              return annotations[String(cluster)] || "";
            });

            // Use clusterOrder to maintain the user's desired order
            const clusterOrder = customAnnotation.clusterOrder || [];
            let uniq_vals = [];
            let uniq_map = {};

            // First, add annotations in the order of clusterOrder
            clusterOrder.forEach((cluster) => {
              const annotation = annotations[String(cluster)];
              if (annotation && !(annotation in uniq_map)) {
                uniq_map[annotation] = uniq_vals.length;
                uniq_vals.push(annotation);
              }
            });

            // Then map the annotation values to indices
            let indices = new Int32Array(annotationValues.length);
            annotationValues.map((x, i) => {
              if (x && x in uniq_map) {
                indices[i] = uniq_map[x];
              } else {
                indices[i] = -1;
              }
            });

            output = {
              type: "factor",
              index: indices,
              levels: uniq_vals,
            };
          }
        } else {
          // Original annotation from dataset
          vec = getAnnotation(annot);
          // dataset.cells.column(annot);

          if (ArrayBuffer.isView(vec)) {
            output = {
              type: "array",
              values: vec.slice(),
            };
          } else {
            let uniq_vals = [];
            let uniq_map = {};
            let indices = new Int32Array(vec.length);
            vec.map((x, i) => {
              if (!(x in uniq_map)) {
                uniq_map[x] = uniq_vals.length;
                uniq_vals.push(x);
              }
              indices[i] = uniq_map[x];
            });

            output = {
              type: "factor",
              index: indices,
              levels: uniq_vals,
            };
          }
        }

        let extracted = [];
        extractBuffers(output, extracted);
        postMessage(
          {
            type: "setAnnotation",
            resp: {
              annotation: annot,
              values: output,
            },
            msg: "Success: GET_ANNOTATION done",
          },
          extracted
        );
      })
      .catch((err) => {
        console.error(err);
        postError(type, err, fatal);
      });
  } else if (type === "computeFeaturesetSummary") {
    loaded
      .then(async (x) => {
        let { annotation, rank_type, cluster, modality } = payload;
        let index = rank_type.indexOf("-");
        let resp;

        if (default_selection === annotation) {
          let anno_markers =
            custom_selection_state.fetchResults(cluster)[modality];

          feature_set_enrich_state.ready().then((x) => {
            resp = feature_set_enrich_state.computeEnrichment(
              anno_markers,
              1,
              rank_type.slice(0, index),
              rank_type.slice(index + 1)
            );
            postSuccess("computeFeaturesetSummary", resp);
          });
        } else {
          let annotation_vec = scran.factorize(getAnnotation(annotation));
          let mds = getMarkerStandAloneForAnnot(annotation, annotation_vec);
          let anno_markers = mds.fetchResults()[modality];

          feature_set_enrich_state.ready().then((x) => {
            resp = feature_set_enrich_state.computeEnrichment(
              anno_markers,
              annotation_vec.levels.indexOf(cluster),
              rank_type.slice(0, index),
              rank_type.slice(index + 1)
            );
            postSuccess("computeFeaturesetSummary", resp);
          });
        }
      })
      .catch((err) => {
        console.error(err);
        postError(type, err, fatal);
      });
  } else if (type === "computeFeaturesetVSSummary") {
    loaded
      .then(async (x) => {
        let { annotation, rank_type, left, right, modality } = payload;
        let index = rank_type.indexOf("-");
        let resp;
        if (default_selection === annotation) {
          let anno_markers = custom_selection_state.computeVersus(left, right);

          feature_set_enrich_state.ready().then((x) => {
            resp = feature_set_enrich_state.computeEnrichment(
              anno_markers.results[modality],
              0,
              rank_type.slice(0, index),
              rank_type.slice(index + 1)
            );
            postSuccess("computeFeaturesetVSSummary", resp);
          });
        } else {
          let annotation_vec = scran.factorize(getAnnotation(annotation));
          let mds = getMarkerStandAloneForAnnot(annotation, annotation_vec);

          let raw_res = mds.computeVersus(
            annotation_vec.levels.indexOf(payload.left),
            annotation_vec.levels.indexOf(payload.right)
          );

          feature_set_enrich_state.ready().then((x) => {
            resp = feature_set_enrich_state.computeEnrichment(
              raw_res.results[modality],
              raw_res.left,
              rank_type.slice(0, index),
              rank_type.slice(index + 1)
            );
            postSuccess("computeFeaturesetVSSummary", resp);
          });
        }
      })
      .catch((err) => {
        console.error(err);
        postError(type, err, fatal);
      });
  } else if (type === "getFeatureScores") {
    loaded
      .then((x) => {
        let { index } = payload;

        let resp = feature_set_enrich_state.computePerCellScores(index);
        postSuccess("setFeatureScores", resp);
      })
      .catch((err) => {
        console.error(err);
        postError(type, err, fatal);
      });
  } else if (type === "getFeatureGeneIndices") {
    loaded
      .then((x) => {
        let { index, cluster, annotation, modality, rank_type } = payload;

        let resp = feature_set_enrich_state.fetchFeatureSetIndices(index);

        let raw_res, marker_resp;

        if (default_selection === annotation) {
          raw_res = custom_selection_state.fetchResults(payload.cluster)[
            payload.modality
          ];
          marker_resp = bakana.formatMarkerResults(
            raw_res,
            1,
            payload.rank_type
          );
        } else {
          let annotation_vec = scran.factorize(getAnnotation(annotation));
          let mds = getMarkerStandAloneForAnnot(annotation, annotation_vec);

          raw_res = mds.fetchResults()[modality];
          // cache_anno_markers[annotation][modality];

          marker_resp = bakana.formatMarkerResults(
            raw_res,
            annotation_vec.levels.indexOf(cluster),
            rank_type
          );
        }

        let indices = marker_resp.ordering
          .map((x, i) => (resp.includes(x) ? i : -100))
          .filter((x) => x !== -100);

        let filtered_marker_resp = {};
        for (const [k, v] of Object.entries(marker_resp)) {
          filtered_marker_resp[k] = v
            .map((x, i) => (indices.includes(i) ? x : -100))
            .filter((x) => x !== -100);
        }

        postSuccess("setFeatureGeneIndices", filtered_marker_resp);
      })
      .catch((err) => {
        console.error(err);
        postError(type, err, fatal);
      });
  } else if (type === "initFeaturesetEnrich") {
    loaded.then(async (x) => {
      let { modality } = payload;

      if (feature_set_enrich_state) {
        feature_set_enrich_state.free();
      }

      feature_set_enrich_state = new bakana.FeatureSetEnrichmentStandalone(
        dataset.features[modality],
        { normalized: dataset.matrix.get(modality) }
      );

      feature_set_enrich_state.ready().then((x) => {
        let collections = feature_set_enrich_state.fetchCollectionDetails();
        let sets = feature_set_enrich_state.fetchSetDetails();
        let resp = {
          collections: collections,
          sets: {
            names: sets.names,
            descriptions: sets.descriptions,
            sizes: sets.sizes.slice(),
            collections: sets.collections.slice(),
          },
        };
        postSuccess("feature_set_enrichment", resp);
      });
    });
  } else if (type === "computeCellAnnotation") {
    let { annotation, cluster, modality } = payload;
    let result = { per_reference: {} };
    let markers = null;
    if (default_selection === annotation) {
      markers = custom_selection_state.fetchResults(cluster);
    } else {
      let annotation_vec = scran.factorize(getAnnotation(annotation));
      let mds = getMarkerStandAloneForAnnot(annotation, annotation_vec);
      markers = mds.fetchResults();
    }
    if (markers !== null && modality in markers) {
      if (cell_labelling_state === null) {
        cell_labelling_state = new bakana.CellLabellingStandalone(
          dataset.features[modality]
        );
      }
      cell_labelling_state
        .ready()
        .then(() => {
          result = cell_labelling_state.computeLabels(markers[modality]);
          postSuccess("computeCellAnnotation", result);
        })
        .catch((err) => {
          console.error("Cell annotation reference data fetch failed:", err);
          // 静默失败，不向用户显示错误，因为这通常是网络问题
          // 用户可以稍后手动重试
          postError(type, new Error("Cell annotation reference data is currently unavailable. Please check your network connection and try again later."), false);
        });
    }
  } else if (type === "getBatchGeneExpression") {
    loaded
      .then((x) => {
        let genes = payload.genes; // array of gene indices
        let annotation = payload.annotation;
        let modality = payload.modality;

        if (!dataset || !dataset.matrix) {
          throw new Error("Dataset or matrix not loaded");
        }

        let matrix = dataset.matrix.get(modality);
        if (!matrix) {
          throw new Error(`Modality '${modality}' not found. Available: ${dataset.matrix.available().join(', ')}`);
        }

        let annotation_vec;
        let clusters, cluster_ids;
        if (subcluster_results[annotation]) {
          const labels = subcluster_results[annotation].labels;
          const uniq_vals = [];
          const uniq_map = {};
          const allNumeric = labels.every((l) => l === "" || !isNaN(Number(l)));
          const seen = new Set();
          labels.forEach((lab) => {
            const s = lab != null ? String(lab) : "";
            if (s && !seen.has(s)) {
              seen.add(s);
              uniq_vals.push(s);
            }
          });
          if (allNumeric) uniq_vals.sort((a, b) => Number(a) - Number(b));
          uniq_vals.forEach((v, i) => (uniq_map[v] = i));
          cluster_ids = new Int32Array(labels.length);
          for (let j = 0; j < labels.length; j++) {
            const lab = labels[j] != null ? String(labels[j]) : "";
            cluster_ids[j] = lab in uniq_map ? uniq_map[lab] : -1;
          }
          clusters = uniq_vals;
        } else if (custom_annotations_state[annotation]) {
          // Custom annotation: use clusterOrder so DotPlot/DimPlot show user's drag order
          const customAnnotation = custom_annotations_state[annotation];
          const sourceAnnotation = customAnnotation.sourceAnnotation;
          const annotations = customAnnotation.annotations;
          const clusterOrder = customAnnotation.clusterOrder || [];
          const sourceVec = getAnnotation(sourceAnnotation);
          let sourceValues;
          if (ArrayBuffer.isView(sourceVec)) {
            sourceValues = Array.from(sourceVec);
          } else if (sourceVec && typeof sourceVec.map === "function") {
            sourceValues = sourceVec.map((v) => v);
          } else {
            sourceValues = Array.from(sourceVec);
          }
          const customLabels = sourceValues.map((cluster) => annotations[String(cluster)] ?? String(cluster));
          // Build levels in clusterOrder order (then append any other labels seen)
          const levelSet = new Set();
          const levelsOrdered = [];
          clusterOrder.forEach((c) => {
            const lab = annotations[String(c)] ?? String(c);
            if (lab && !levelSet.has(lab)) {
              levelSet.add(lab);
              levelsOrdered.push(lab);
            }
          });
          customLabels.forEach((lab) => {
            if (lab != null && lab !== "" && !levelSet.has(lab)) {
              levelSet.add(lab);
              levelsOrdered.push(lab);
            }
          });
          const labelToIdx = new Map();
          levelsOrdered.forEach((lab, i) => labelToIdx.set(lab, i));
          cluster_ids = new Int32Array(customLabels.length);
          for (let j = 0; j < customLabels.length; j++) {
            const idx = labelToIdx.get(customLabels[j]);
            cluster_ids[j] = idx !== undefined ? idx : -1;
          }
          clusters = levelsOrdered;
        } else {
          annotation_vec = scran.factorize(getAnnotation(annotation));
          let clusters_original = annotation_vec.levels;
          let cluster_ids_original = annotation_vec.ids;
          if (cluster_ids_original && typeof cluster_ids_original.array === "function") {
            cluster_ids_original = cluster_ids_original.array();
          }
          cluster_ids_original = Array.from(cluster_ids_original);

          // scran.factorize returns levels in string-sorted order; fix for numeric clusters

          const allNumeric = clusters_original.every((c) => !isNaN(Number(c)));

          if (allNumeric) {
            const sortedClusters = [...clusters_original].sort((a, b) => Number(a) - Number(b));
            const indexMap = new Map();
            clusters_original.forEach((cluster, oldIdx) => {
              const newIdx = sortedClusters.indexOf(cluster);
              indexMap.set(oldIdx, newIdx);
              indexMap.set(String(oldIdx), newIdx);
            });
            cluster_ids = new Int32Array(cluster_ids_original.length);
            for (let i = 0; i < cluster_ids_original.length; i++) {
              const oldId = cluster_ids_original[i];
              const newId = indexMap.get(Number(oldId)) ?? indexMap.get(String(oldId));
              cluster_ids[i] = newId !== undefined ? newId : oldId;
            }
            clusters = sortedClusters;
          } else {
            clusters = clusters_original;
            cluster_ids = cluster_ids_original.map((x) => Number(x));
          }
        }

        let data = {};

        // Matrix is genes x cells: row(gene_idx) gives expression across cells
        const nCells = matrix.numberOfColumns();
        const nCellsAnnot = cluster_ids.length;
        const cellLimit = Math.min(nCells, nCellsAnnot);

        // For each gene, compute avg expression and pct expressed per cluster
        for (let gene_idx of genes) {
          let expr_vec = matrix.row(gene_idx);
          if (expr_vec && typeof expr_vec.array === "function") {
            expr_vec = expr_vec.array();
          }
          data[gene_idx] = {};

          for (let i = 0; i < clusters.length; i++) {
            let cluster = clusters[i];
            let cluster_cells = [];

            // cluster_ids[j] = i means cell j belongs to cluster clusters[i]
            for (let j = 0; j < cellLimit; j++) {
              if (Number(cluster_ids[j]) === i) {
                const val = expr_vec[j];
                if (val !== undefined && val !== null && Number.isFinite(Number(val))) {
                  cluster_cells.push(Number(val));
                }
              }
            }

            if (cluster_cells.length > 0) {
              // Compute average expression (mean of all values)
              let sum = 0;
              let non_zero_count = 0;
              for (let val of cluster_cells) {
                sum += val;
                if (val > 0) non_zero_count++;
              }
              let avg = sum / cluster_cells.length;
              let pct = non_zero_count / cluster_cells.length;

              data[gene_idx][cluster] = {
                avg: avg,
                pct: pct
              };
            } else {
              data[gene_idx][cluster] = {
                avg: 0,
                pct: 0
              };
            }
          }
        }

        postMessage({
          type: "setBatchGeneExpression",
          resp: {
            genes: genes,
            clusters: clusters,
            data: data
          },
          msg: "Success: GET_BATCH_GENE_EXPRESSION done"
        });
      })
      .catch((err) => {
        console.error(err);
        postError(type, err, fatal);
      });
  } else if (type === "saveCustomAnnotation") {
    loaded
      .then((x) => {
        let columnName = payload.columnName;
        let annotations = payload.annotations;
        let sourceAnnotation = payload.sourceAnnotation;
        let clusterOrder = payload.clusterOrder;

        custom_annotations_state[columnName] = {
          annotations: annotations,
          sourceAnnotation: sourceAnnotation,
          clusterOrder: clusterOrder
        };

        postMessage({
          type: "saveCustomAnnotation_DATA",
          resp: {
            success: true,
            columnName: columnName
          },
          msg: "Success: SAVE_CUSTOM_ANNOTATION done"
        });
      })
      .catch((err) => {
        console.error(err);
        postError(type, err, fatal);
      });
  } else if (type === "getCustomAnnotation") {
    loaded
      .then((x) => {
        let columnName = payload.columnName;
        let data = custom_annotations_state[columnName] || null;

        postMessage({
          type: "getCustomAnnotation_DATA",
          resp: data,
          msg: "Success: GET_CUSTOM_ANNOTATION done"
        });
      })
      .catch((err) => {
        console.error(err);
        postError(type, err, fatal);
      });
  } else if (type === "findSubcluster") {
    loaded
      .then((x) => {
        const {
          annotation,
          selectedClusters: selectedClustersList,
          newColumnName,
          parameters = {},
        } = payload;
        const selectedSet = new Set((selectedClustersList || []).map(String));
        const k = Math.max(2, Number(parameters.k) || 10);
        const scheme = parameters.scheme || "rank";
        const algorithm = parameters.algorithm || "multilevel";
        const multilevel_resolution = Number(parameters.multilevel_resolution) || 1;
        const leiden_resolution = Number(parameters.leiden_resolution) || 1;
        const walktrap_steps = Math.max(1, Number(parameters.walktrap_steps) || 4);

        const labels = getAnnotationLabels(annotation);
        const nCells = labels.length;
        const subsetIndices = [];
        const parentLabels = [];
        for (let i = 0; i < nCells; i++) {
          const lab = String(labels[i] ?? "");
          if (selectedSet.has(lab)) {
            subsetIndices.push(i);
            parentLabels.push(lab);
          }
        }
        const nSubset = subsetIndices.length;
        if (nSubset === 0) {
          postMessage({
            type: "findSubcluster_DATA",
            resp: { success: false, message: "No cells in selected clusters." },
            msg: "No cells to subcluster"
          });
          return;
        }

        const embedKeys = Object.keys(dataset.reduced_dimensions || {}).filter(
          (key) => key.toLowerCase() !== "pca"
        );
        if (embedKeys.length === 0) {
          postMessage({
            type: "findSubcluster_DATA",
            resp: { success: false, message: "No UMAP/t-SNE embedding available." },
            msg: "No embedding"
          });
          return;
        }
        const embedKey = embedKeys[0];
        const emb = dataset.reduced_dimensions[embedKey];
        const nDims = Math.min(2, emb.length);
        const data = new Float64Array(nDims * nSubset);
        for (let i = 0; i < nSubset; i++) {
          const idx = subsetIndices[i];
          for (let d = 0; d < nDims; d++) {
            data[d * nSubset + i] = emb[d][idx];
          }
        }

        let index = null;
        let neighbors = null;
        let graph = null;
        let clusterResult = null;
        try {
          index = scran.buildNeighborSearchIndex(data, {
            numberOfDims: nDims,
            numberOfCells: nSubset,
          });
          const kActual = Math.min(k, Math.max(1, nSubset - 1));
          neighbors = scran.findNearestNeighbors(index, kActual);
          graph = scran.buildSNNGraph(neighbors, { scheme });
          clusterResult = scran.clusterSNNGraph(graph, {
            method: algorithm,
            multiLevelResolution: multilevel_resolution,
            leidenResolution: leiden_resolution,
            leidenModularityObjective: true,
            walktrapSteps: walktrap_steps,
          });
          if (algorithm === "multilevel" && clusterResult.best() == null) {
            clusterResult.setBest(0);
          }
          let membership = clusterResult.membership({ copy: true });
          if (membership && typeof membership.array === "function") {
            membership = membership.array();
          }
          membership = Array.from(membership || []);

          const fullLabels = labels.slice();
          for (let i = 0; i < nSubset; i++) {
            fullLabels[subsetIndices[i]] = parentLabels[i] + "_" + String(membership[i] ?? 0);
          }
          subcluster_results[newColumnName] = { labels: fullLabels };

          postMessage({
            type: "findSubcluster_DATA",
            resp: { success: true, newColumnName },
            msg: "Success: findSubcluster done"
          });
        } catch (err) {
          postMessage({
            type: "findSubcluster_DATA",
            resp: { success: false, message: (err && err.message) || String(err) },
            msg: "findSubcluster failed"
          });
        } finally {
          if (clusterResult && typeof clusterResult.free === "function") clusterResult.free();
          if (graph && typeof graph.free === "function") graph.free();
          if (neighbors && typeof neighbors.free === "function") neighbors.free();
          if (index && typeof index.free === "function") index.free();
        }
      })
      .catch((err) => {
        console.error(err);
        postMessage({
          type: "findSubcluster_DATA",
          resp: { success: false, message: (err && err.message) || String(err) },
          msg: "findSubcluster failed"
        });
      });
  } else if (type === "exportCellAnnotations") {
    loaded
      .then((x) => {
        const { sourceAnnotation, clusterAnnotationMap, columnName, excludedClusters = [], excludedSelections = [], customSelectionData = {} } = payload;

        try {
          // Get cell barcodes
          const rowNames = dataset?.cells?.rowNames?.() || null;
          if (!rowNames) {
            postMessage({
              type: "exportCellAnnotations_DATA",
              resp: {
                success: false,
                message: "Dataset has no cell barcodes"
              },
            });
            return;
          }

          // Get cluster labels for each cell
          const labels = getAnnotationLabels(sourceAnnotation);
          if (!labels || labels.length === 0) {
            postMessage({
              type: "exportCellAnnotations_DATA",
              resp: {
                success: false,
                message: "Could not retrieve annotation labels"
              },
            });
            return;
          }

          // Build set of excluded cell indices from Custom Selections
          const excludedIndices = new Set();

          if (excludedSelections.length > 0) {
            excludedSelections.forEach(selectionId => {
              // Get the selection data (array of cell indices)
              const selectionArray = customSelectionData[selectionId];
              if (selectionArray && Array.isArray(selectionArray)) {
                // Add all cell indices from this selection to excluded set
                selectionArray.forEach(cellIndex => {
                  excludedIndices.add(cellIndex);
                });
                console.log(`Selection ${selectionId}: excluded ${selectionArray.length} cells`);
              }
            });
          }

          // Build CSV content with filtering
          // A cell is excluded if:
          // 1. Its cluster is in excludedClusters, OR
          // 2. Its index is in excludedIndices (from Custom Selections)
          const csvLines = [`barcode,cluster,${columnName}`];
          let excludedByCluster = 0;
          let excludedBySelection = 0;
          let excludedByBoth = 0;

          for (let i = 0; i < labels.length; i++) {
            const cluster = String(labels[i] || "");

            // Check if cluster is excluded
            const clusterExcluded = excludedClusters.includes(cluster);

            // Check if cell index is in excluded selections
            const selectionExcluded = excludedIndices.has(i);

            // Track exclusion reasons for logging
            if (clusterExcluded && selectionExcluded) {
              excludedByBoth++;
            } else if (clusterExcluded) {
              excludedByCluster++;
            } else if (selectionExcluded) {
              excludedBySelection++;
            }

            // Skip if either condition is true (union of exclusions)
            if (clusterExcluded || selectionExcluded) {
              continue;
            }

            const barcode = rowNames[i] || "";
            const annotation = clusterAnnotationMap[cluster] || "";
            csvLines.push(`${barcode},${cluster},${annotation}`);
          }

          const csvContent = csvLines.join("\n");
          const totalExcluded = excludedByCluster + excludedBySelection + excludedByBoth;

          console.log(`Export complete: ${csvLines.length - 1} cells exported, ${totalExcluded} cells excluded`);
          console.log(`  - Excluded by cluster only: ${excludedByCluster}`);
          console.log(`  - Excluded by selection only: ${excludedBySelection}`);
          console.log(`  - Excluded by both (overlap): ${excludedByBoth}`);

          postMessage({
            type: "exportCellAnnotations_DATA",
            resp: {
              success: true,
              csvContent,
              filename: `${columnName}_cell_annotations.csv`
            },
          });
        } catch (err) {
          console.error("Error exporting cell annotations:", err);
          postMessage({
            type: "exportCellAnnotations_DATA",
            resp: {
              success: false,
              message: err.message || String(err)
            },
          });
        }
      })
      .catch((err) => {
        console.error(err);
        postMessage({
          type: "exportCellAnnotations_DATA",
          resp: {
            success: false,
            message: err.message || String(err)
          },
        });
      });
  } else if (type === "checkH5adMarkers") {
    loaded
      .then((x) => {
        let hasMarkers = false;
        try {
          if (dataset && dataset.other_data && dataset.other_data.uns) {
            const uns = dataset.other_data.uns;
            // Check for common marker gene keys in uns
            const markerKeys = ['rank_genes_groups', 'markers', 'top_markers'];
            for (const key of markerKeys) {
              if (key in uns) {
                hasMarkers = true;
                break;
              }
            }
          }
        } catch (err) {
          console.error("Error checking H5AD markers:", err);
        }
        postMessage({
          type: "checkH5adMarkers_DATA",
          resp: { hasMarkers },
        });
      })
      .catch((err) => {
        console.error(err);
        postMessage({
          type: "checkH5adMarkers_DATA",
          resp: { hasMarkers: false },
        });
      });
  } else if (type === "generateTopMarkerDotplot") {
    loaded
      .then(async (x) => {
        const { annotation, topN = 7, uploadedMarkers, useH5adMarkers } = payload;

        try {
          let markersByCluster = {};

          // Get markers from H5AD if available
          if (useH5adMarkers && dataset && dataset.other_data && dataset.other_data.uns) {
            const uns = dataset.other_data.uns;
            if ('rank_genes_groups' in uns) {
              const rgg = uns.rank_genes_groups;
              if (rgg.names) {
                const clusters = Object.keys(rgg.names);
                for (const cluster of clusters) {
                  const genes = rgg.names[cluster];
                  markersByCluster[cluster] = genes.slice(0, topN);
                }
              }
            }
          } else if (uploadedMarkers) {
            // Use uploaded markers
            markersByCluster = uploadedMarkers;
            // Limit to topN
            for (const cluster in markersByCluster) {
              markersByCluster[cluster] = markersByCluster[cluster].slice(0, topN);
            }
          } else {
            postMessage({
              type: "generateTopMarkerDotplot_DATA",
              resp: {
                success: false,
                message: "No marker genes available. Please upload a marker file."
              },
            });
            return;
          }

          // Get annotation labels
          const labels = getAnnotationLabels(annotation);
          const clusters = [...new Set(labels.map(String))].sort((a, b) => {
            const numA = parseInt(a);
            const numB = parseInt(b);
            if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
            return a.localeCompare(b);
          });

          // Collect all unique genes
          const allGenes = new Set();
          for (const cluster of clusters) {
            if (markersByCluster[cluster]) {
              markersByCluster[cluster].forEach(g => allGenes.add(g));
            }
          }
          const genes = Array.from(allGenes);

          if (genes.length === 0) {
            postMessage({
              type: "generateTopMarkerDotplot_DATA",
              resp: {
                success: false,
                message: "No marker genes found for selected clusters."
              },
            });
            return;
          }

          // Get gene indices
          const geneNames = dataset.all_features.rowNames();
          const geneIndices = [];
          const validGenes = [];
          for (const gene of genes) {
            const idx = geneNames.indexOf(gene);
            if (idx >= 0) {
              geneIndices.push(idx);
              validGenes.push(gene);
            }
          }

          if (geneIndices.length === 0) {
            postMessage({
              type: "generateTopMarkerDotplot_DATA",
              resp: {
                success: false,
                message: "None of the marker genes found in dataset."
              },
            });
            return;
          }

          // Get expression matrix
          const matrix = dataset.matrix("RNA");
          const nCells = labels.length;

          // Calculate mean expression and percent expressed per cluster
          const exprMatrix = [];
          const pctMatrix = [];

          for (const gene of validGenes) {
            const geneIdx = geneNames.indexOf(gene);
            const exprRow = [];
            const pctRow = [];

            for (const cluster of clusters) {
              const cellIndices = [];
              for (let i = 0; i < nCells; i++) {
                if (String(labels[i]) === cluster) {
                  cellIndices.push(i);
                }
              }

              if (cellIndices.length === 0) {
                exprRow.push(0);
                pctRow.push(0);
                continue;
              }

              let sum = 0;
              let count = 0;
              let expressed = 0;

              for (const cellIdx of cellIndices) {
                const val = matrix.row(geneIdx)[cellIdx] || 0;
                sum += val;
                count++;
                if (val > 0) expressed++;
              }

              const meanExpr = count > 0 ? sum / count : 0;
              const pctExpr = count > 0 ? expressed / count : 0;

              exprRow.push(meanExpr);
              pctRow.push(pctExpr);
            }

            exprMatrix.push(exprRow);
            pctMatrix.push(pctRow);
          }

          // Normalize expression matrix to 0-1 range per gene
          const normalizedMatrix = exprMatrix.map(row => {
            const max = Math.max(...row);
            const min = Math.min(...row);
            const range = max - min;
            if (range === 0) return row.map(() => 0);
            return row.map(val => (val - min) / range);
          });

          postMessage({
            type: "generateTopMarkerDotplot_DATA",
            resp: {
              success: true,
              data: {
                clusters,
                genes: validGenes,
                matrix: normalizedMatrix,
                pctMatrix,
              },
            },
          });
        } catch (err) {
          console.error("Error generating top marker dotplot:", err);
          postMessage({
            type: "generateTopMarkerDotplot_DATA",
            resp: {
              success: false,
              message: err.message || String(err)
            },
          });
        }
      })
      .catch((err) => {
        console.error(err);
        postMessage({
          type: "generateTopMarkerDotplot_DATA",
          resp: {
            success: false,
            message: err.message || String(err)
          },
        });
      });
  } else {
    console.error("MIM:::msg type incorrect");
    postError(type, "Type not defined", fatal);
  }
};
