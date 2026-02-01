import { useState, useContext, useEffect } from "react";
import {
  Tabs, Tab, Label, Text, HTMLSelect, FileInput, Card, Elevation,
  Button, Divider, Callout, H2,
} from "@blueprintjs/core";
import "./index.css";
import { AppContext } from "../../context/AppContext";
import { generateUID } from "../../utils/utils";
import { Tooltip2 } from "@blueprintjs/popover2";
import { H5ADCard } from "./H5ADCard";
import { SECard } from "./SECard";
import { ZippedADBCard } from "./ZippedADBCard";
import JSZip from "jszip";
import { searchZippedArtifactdb } from "bakana";

export function LoadExplore({ setShowPanel, ...props }) {
  const {
    setExploreFiles, setPreInputFiles, preInputFilesStatus, setPreInputFilesStatus,
    setAppMode,
  } = useContext(AppContext);

  const [tabSelected, setTabSelected] = useState("ProjectHub");
  const [projecthubSel, setProjecthubSel] = useState("none");
  const [projecthubEntries, setProjecthubEntries] = useState(null);
  const [projecthubLoading, setProjecthubLoading] = useState(false);
  const [projecthubError, setProjecthubError] = useState(null);
  const [exploreInputs, setExploreInputs] = useState([]);
  const [tmpStatusValid, setTmpStatusValid] = useState(true);
  const [tmpLoadInputs, setTmpLoadInputs] = useState({
    name: `explore-dataset-1`,
    format: tabSelected,
  });
  const [inputOptions, setInputOptions] = useState([]);
  const [jsZipNames, setJsZipNames] = useState(null);
  const [jsZipObjs, setJSZipObjs] = useState(null);

  const handleClose = () => {
    setTmpLoadInputs({ name: `explore-dataset-1`, format: tabSelected });
    setInputOptions([]);
    setTmpStatusValid(true);
  };

  const handleLoadDataset = () => {
    let mapFiles = {};
    mapFiles[tmpLoadInputs.name] = tmpLoadInputs;
    mapFiles[tmpLoadInputs.name]["options"] = inputOptions;

    // Check if data has reduced dimensions
    const fileStatus = preInputFilesStatus?.[tmpLoadInputs.name];
    const hasReducedDims = fileStatus?.reduced_dimension_names &&
                          Array.isArray(fileStatus.reduced_dimension_names) &&
                          fileStatus.reduced_dimension_names.length > 0;

    let fInputFiles = { files: mapFiles };

    if (hasReducedDims) {
      // Has reduced dimensions - load into ExplorerMode for visualization only
      setExploreFiles(fInputFiles);
      setShowPanel("explore");
    } else {
      // No reduced dimensions - need to run analysis
      // Mark for analysis mode
      mapFiles[tmpLoadInputs.name].mode = "analysis";

      // Don't set batch and subset - let them be undefined
      // The worker will handle undefined properly
      setExploreFiles(fInputFiles);
      setShowPanel("explore");
    }
  };

  // Load ProjectHub index
  useEffect(() => {
    setProjecthubLoading(true);
    fetch("/projecthub/index.json")
      .then((resp) => {
        if (!resp.ok) throw new Error(`Failed to load ProjectHub index (HTTP ${resp.status})`);
        return resp.json();
      })
      .then((data) => {
        setProjecthubEntries(Array.isArray(data) ? data : []);
        setProjecthubLoading(false);
      })
      .catch((err) => {
        console.error("Failed to load ProjectHub index", err);
        setProjecthubError("Failed to load ProjectHub datasets");
        setProjecthubEntries([]);
        setProjecthubLoading(false);
      });
  }, []);

  // Validate inputs
  useEffect(() => {
    if (tmpLoadInputs) {
      let all_valid = true;
      let x = tmpLoadInputs;
      if (x.format === "MatrixMarket") {
        if (!x.mtx) all_valid = false;
      } else if (x.format === "10X") {
        if (!x.h5) all_valid = false;
      } else if (x.format === "H5AD") {
        if (!x.h5) all_valid = false;
      } else if (x.format === "SummarizedExperiment") {
        if (!x.rds) all_valid = false;
      } else if (x.format === "ZippedArtifactdb") {
        if (!x.zipfile || !x.zipname) all_valid = false;
      } else if (x.format === "ProjectHub") {
        all_valid = false;
      }

      setTmpStatusValid(all_valid);
      if (all_valid) {
        tmpLoadInputs["uid"] = generateUID(tmpLoadInputs);
        setExploreInputs([tmpLoadInputs]);
      }
    }
  }, [tmpLoadInputs]);

  // Preflight check
  useEffect(() => {
    if (Array.isArray(exploreInputs) && exploreInputs.length > 0) {
      let mapFiles = {};
      for (const f of exploreInputs) {
        mapFiles[f.name] = f;
      }
      setPreInputFiles({ files: mapFiles });
    }
  }, [exploreInputs, setPreInputFiles]);

  const handleProjectHubSelect = async (value) => {
    setProjecthubSel(value || "none");
    if (value && value !== "none") {
      const selectedEntry = projecthubEntries.find(x => x.id === value);
      if (selectedEntry) {
        try {
          setProjecthubLoading(true);
          setProjecthubError(null);

          // Directly fetch the H5AD file from the server
          const response = await fetch(selectedEntry.url);
          if (!response.ok) {
            throw new Error(`Failed to fetch dataset (HTTP ${response.status})`);
          }

          // Convert to File object (same as local upload)
          const blob = await response.blob();
          const fileName = selectedEntry.url.split("/").pop();
          const file = new File([blob], fileName, { type: "application/octet-stream" });

          const name = `projecthub-${value}`;
          const entry = {
            name,
            format: "H5AD",  // H5AD format
            h5: file,
            options: {}  // Empty options object
          };
          const mapFiles = {};
          mapFiles[name] = entry;

          // Load into ExplorerMode (same as local file upload)
          setExploreFiles({ files: mapFiles });
          setAppMode("explore");
          setProjecthubLoading(false);
        } catch (err) {
          console.error("Failed to load ProjectHub dataset", err);
          setProjecthubError(err.message || "Failed to load ProjectHub dataset");
          setProjecthubLoading(false);
          setProjecthubSel("none");
        }
      }
    }
  };

  const render_inputs = () => {
    return (
      <Tabs animate={true} renderActiveTabPanelOnly={true} vertical={true}
        defaultSelectedTabId={tabSelected}
        onChange={(ntab) => {
          let tmp = { ...tmpLoadInputs };
          tmp["format"] = ntab;
          setTmpLoadInputs(tmp);
          setTabSelected(ntab);
          setExploreInputs([]);
          setInputOptions([]);
          setPreInputFiles(null);
          setPreInputFilesStatus(null);
        }}
      >
        <Tab id="ProjectHub" title="ProjectHub" panel={
          <>
            <div className="row">
              <Callout intent="primary">
                <p>Load pre-configured single-cell datasets from the server.</p>
              </Callout>
            </div>
            <div className="row">
              <Label className="row-input">
                <Text className="text-100"><span>Choose a ProjectHub dataset</span></Text>
                {projecthubLoading && "Loading dataset..."}
                {!projecthubLoading && projecthubError && <span style={{ color: "#C23030" }}>{projecthubError}</span>}
                {!projecthubLoading && !projecthubError && Array.isArray(projecthubEntries) && projecthubEntries.length > 0 && (
                  <HTMLSelect value={projecthubSel} onChange={(e) => handleProjectHubSelect(e.target.value)}>
                    <option value="none">--- no selection ---</option>
                    {projecthubEntries.map((x, i) => (
                      <option key={x.id || i} value={x.id}>{x.label || x.id}</option>
                    ))}
                  </HTMLSelect>
                )}
                {!projecthubLoading && !projecthubError && Array.isArray(projecthubEntries) && projecthubEntries.length === 0 && "No ProjectHub datasets available"}
              </Label>
            </div>
            <div className="row">
              <Callout intent="info">
                <p>Select a dataset from the dropdown above. The file will be downloaded and loaded into your browser for analysis.</p>
                {projecthubLoading && <p style={{ marginTop: "8px", fontWeight: "bold", color: "#0F9960" }}>Downloading dataset...</p>}
              </Callout>
            </div>
          </>
        } />
        <Tab id="MatrixMarket" title="10X MatrixMarket" panel={
          <>
            <div className="row">
              <Callout intent="primary">
                <p>Load a 10X MatrixMarket file (.mtx or .mtx.gz).</p>
              </Callout>
            </div>
            <div className="row">
              <Label className="row-input">
                <Text className="text-100"><span>Choose a count matrix file</span></Text>
                <FileInput style={{ marginTop: "5px" }}
                  text={tmpLoadInputs?.mtx ? tmpLoadInputs?.mtx.name : ".mtx or .mtx.gz"}
                  onInputChange={(msg) => {
                    if (msg.target.files) {
                      setTmpLoadInputs({ ...tmpLoadInputs, mtx: msg.target.files[0] });
                    }
                  }}
                />
              </Label>
              <Label className="row-input">
                <Text className="text-100"><span>Choose a feature or gene file (optional)</span></Text>
                <FileInput style={{ marginTop: "5px" }}
                  text={tmpLoadInputs?.genes ? tmpLoadInputs?.genes.name : ".tsv or .tsv.gz"}
                  onInputChange={(msg) => {
                    if (msg.target.files) {
                      setTmpLoadInputs({ ...tmpLoadInputs, genes: msg.target.files[0] });
                    }
                  }}
                />
              </Label>
              <Label className="row-input">
                <Text className="text-100"><span>Choose a barcode annotation file (optional)</span></Text>
                <FileInput style={{ marginTop: "5px" }}
                  text={tmpLoadInputs?.annotations ? tmpLoadInputs?.annotations.name : ".tsv or .tsv.gz"}
                  onInputChange={(msg) => {
                    if (msg.target.files) {
                      setTmpLoadInputs({ ...tmpLoadInputs, annotations: msg.target.files[0] });
                    }
                  }}
                />
              </Label>
            </div>
          </>
        } />
        <Tab id="10X" title="10X HDF5" panel={
          <>
            <div className="row">
              <Callout intent="primary">
                <p>Load a HDF5 file in the 10X feature-barcode format (.h5 or .hdf5).</p>
              </Callout>
            </div>
            <div className="row">
              <Label className="row-input">
                <Text className="text-100"><span>Choose a 10X HDF5 file</span></Text>
                <FileInput style={{ marginTop: "5px" }}
                  text={tmpLoadInputs?.h5 ? tmpLoadInputs?.h5.name : ".h5 or .hdf5"}
                  onInputChange={(msg) => {
                    if (msg.target.files) {
                      setTmpLoadInputs({ ...tmpLoadInputs, h5: msg.target.files[0] });
                    }
                  }}
                />
              </Label>
            </div>
          </>
        } />
        <Tab id="H5AD" title="H5AD" panel={
          <div>
            <div className="row">
              <Callout intent="primary">
                <p>Load a H5AD (*.h5ad) file containing a count matrix or pre-computed results.</p>
              </Callout>
            </div>
            <div className="row">
              <Label className="row-input">
                <Text className="text-100"><span>Choose a H5AD file</span></Text>
                <FileInput style={{ marginTop: "5px" }}
                  text={tmpLoadInputs?.h5 ? tmpLoadInputs?.h5.name : ".h5ad"}
                  onInputChange={(msg) => {
                    if (msg.target.files) {
                      setTmpLoadInputs({ ...tmpLoadInputs, h5: msg.target.files[0] });
                    }
                  }}
                />
              </Label>
            </div>
          </div>
        } />
        <Tab id="SummarizedExperiment" title="RDS" panel={
          <div>
            <div className="row">
              <Callout intent="primary">
                <p>Load an RDS (*.rds) file containing a SummarizedExperiment or SingleCellExperiment.</p>
              </Callout>
            </div>
            <div className="row">
              <Label className="row-input">
                <Text className="text-100"><span>Choose an RDS file</span></Text>
                <FileInput style={{ marginTop: "5px" }}
                  text={tmpLoadInputs?.rds ? tmpLoadInputs?.rds.name : ".rds"}
                  onInputChange={(msg) => {
                    if (msg.target.files) {
                      setTmpLoadInputs({ ...tmpLoadInputs, rds: msg.target.files[0] });
                    }
                  }}
                />
              </Label>
            </div>
          </div>
        } />
      </Tabs>
    );
  };

  // Check if we have reduced dimensions info
  const fileStatus = preInputFilesStatus?.[tmpLoadInputs.name];
  const hasReducedDims = fileStatus?.reduced_dimension_names &&
                        Array.isArray(fileStatus.reduced_dimension_names) &&
                        fileStatus.reduced_dimension_names.length > 0;
  const buttonText = hasReducedDims ? "Explore" : "Analyze";
  const buttonIntent = hasReducedDims ? "primary" : "warning";

  return (
    <Card className="section" interactive={false} elevation={Elevation.ZERO}>
      <div className="section-header">
        <H2 className="section-header-title">Load Dataset</H2>
      </div>
      <Divider />
      <div className="section-content">
        <div className="section-content-body">
          <Callout>
            <p><strong>Choose your data source:</strong></p>
            <ul style={{ marginTop: "8px", marginBottom: "8px" }}>
              <li><strong>ProjectHub:</strong> Server-side datasets with server-side computation</li>
              <li><strong>Upload files:</strong> Your local files with browser-based computation (WebAssembly)</li>
            </ul>
            {preInputFilesStatus && tmpLoadInputs.name in preInputFilesStatus && tabSelected !== "ProjectHub" && (
              <p style={{ marginTop: "8px" }}>
                {hasReducedDims ? (
                  <span style={{ color: "#0F9960", fontWeight: "bold" }}>✓ Dataset has reduced dimensions. Click "Explore" to visualize.</span>
                ) : (
                  <span style={{ color: "#D9822B", fontWeight: "bold" }}>⚠ No reduced dimensions found. Click "Analyze" to run analysis in your browser.</span>
                )}
              </p>
            )}
          </Callout>
          {render_inputs()}
        </div>
        <div className="section-info">
          <div className="section-inputs">
            {exploreInputs.map((x, i) => {
              if (x.format === "H5AD" && x.h5) {
                return (
                  <H5ADCard key={i} resource={x} index={i}
                    preflight={preInputFilesStatus && preInputFilesStatus[x.name]}
                    inputOpts={inputOptions} setInputOpts={setInputOptions}
                    inputs={exploreInputs} setInputs={setExploreInputs}
                    selectedFsetModality={props?.selectedFsetModality}
                    setSelectedFsetModality={props?.setSelectedFsetModality}
                  />
                );
              } else if (x.format === "SummarizedExperiment" && x.rds) {
                return (
                  <SECard key={i} resource={x} index={i}
                    preflight={preInputFilesStatus && preInputFilesStatus[x.name]}
                    inputOpts={inputOptions} setInputOpts={setInputOptions}
                    inputs={exploreInputs} setInputs={setExploreInputs}
                    selectedFsetModality={props?.selectedFsetModality}
                    setSelectedFsetModality={props?.setSelectedFsetModality}
                  />
                );
              } else if (x.format === "ZippedArtifactdb" && x.zipfile) {
                return (
                  <ZippedADBCard key={i} resource={x} index={i}
                    preflight={preInputFilesStatus && preInputFilesStatus[x.name]}
                    inputOpts={inputOptions} setInputOpts={setInputOptions}
                    inputs={exploreInputs} setInputs={setExploreInputs}
                    selectedFsetModality={props?.selectedFsetModality}
                    setSelectedFsetModality={props?.setSelectedFsetModality}
                  />
                );
              }
              return null;
            })}
          </div>
        </div>
      </div>
      <Divider />
      <div className="section-footer">
        <Tooltip2 content="Clear loaded dataset" placement="left">
          <Button icon="cross" intent={"danger"} large={true} onClick={handleClose} text="Clear" />
        </Tooltip2>
        <Tooltip2 content={hasReducedDims ? "Explore pre-computed results" : "Run analysis on this dataset"} placement="right">
          <Button icon={hasReducedDims ? "eye-open" : "flame"} onClick={handleLoadDataset}
            intent={buttonIntent} large={true} disabled={!tmpStatusValid || tabSelected === "ProjectHub"}
            text={buttonText}
          />
        </Tooltip2>
      </div>
    </Card>
  );
}
