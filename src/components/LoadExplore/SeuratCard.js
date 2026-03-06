import { useState, useEffect } from "react";
import {
  Label,
  Text,
  Button,
  Callout,
  FormGroup,
  EditableText,
  FileInput,
  ButtonGroup,
} from "@blueprintjs/core";

import "./index.css";

export function SeuratCard({
  resource,
  index,
  preflight,
  inputOpts,
  setInputOpts,
  inputs,
  setInputs,
  ...props
}) {
  const [dsMeta, setDsMeta] = useState(null);
  const [collapse, setCollapse] = useState(true);

  // when preflight is available
  useEffect(() => {
    if (preflight && preflight !== null && preflight !== undefined) {
      setDsMeta(preflight);
    }
  }, [preflight]);

  useEffect(() => {
    setCollapse(props?.expand);
  }, [props?.expand]);

  const handleRemove = () => {
    let tmpInputs = [...inputs];
    tmpInputs.splice(index, 1);
    setInputs(tmpInputs);

    let tmpInputOpts = [...inputOpts];
    tmpInputOpts.splice(index, 1);
    setInputOpts(tmpInputOpts);
  };

  return (
    <Callout className="section-input-item">
      <div className="section-input-item-header">
        <EditableText
          intent="primary"
          confirmOnEnterKey={true}
          defaultValue={resource.name}
          alwaysRenderInput={true}
        />
        <ButtonGroup minimal={true}>
          <Button
            icon={collapse ? "minimize" : "maximize"}
            minimal={true}
            onClick={() => {
              setCollapse(!collapse);
            }}
          />
          <Button icon="cross" minimal={true} onClick={handleRemove} />
        </ButtonGroup>
      </div>
      <div className={dsMeta ? "" : "bp4-skeleton"}>
        <p>
          This <strong>Seurat</strong> dataset contains{" "}
          {dsMeta && dsMeta.cells_count} cells
          {dsMeta && dsMeta.assays && dsMeta.assays.length > 0 && (
            <span>
              {" "}with assays: <strong>{dsMeta.assays.join(", ")}</strong>
            </span>
          )}
        </p>
        {dsMeta && dsMeta.reductions && dsMeta.reductions.length > 0 && (
          <p>
            Available dimensionality reductions:{" "}
            <strong>{dsMeta.reductions.join(", ")}</strong>
          </p>
        )}
        {dsMeta && dsMeta.metadata_columns && dsMeta.metadata_columns.length > 0 && (
          <FormGroup>
            <Label>
              <Text>
                Metadata columns: {dsMeta.metadata_columns.length} columns available
              </Text>
            </Label>
          </FormGroup>
        )}
      </div>
    </Callout>
  );
}
