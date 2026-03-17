import React, { useState, useEffect } from "react";
import {
  Dialog,
  Button,
  Checkbox,
  Divider,
  Callout,
} from "@blueprintjs/core";
import "./SubsetExportDialog.css";

const SubsetExportDialog = ({
  isOpen,
  onClose,
  onConfirm,
  clusterList,
  customSelection,
}) => {
  const [excludedClusters, setExcludedClusters] = useState(new Set());
  const [excludedSelections, setExcludedSelections] = useState(new Set());

  // Reset state when dialog opens
  useEffect(() => {
    if (isOpen) {
      setExcludedClusters(new Set());
      setExcludedSelections(new Set());
    }
  }, [isOpen]);

  // Get Custom Selection names from customSelection object
  const customSelections = customSelection ? Object.keys(customSelection) : [];

  const handleClusterToggle = (cluster) => {
    const newSet = new Set(excludedClusters);
    if (newSet.has(cluster)) {
      newSet.delete(cluster);
    } else {
      newSet.add(cluster);
    }
    setExcludedClusters(newSet);
  };

  const handleSelectionToggle = (selection) => {
    const newSet = new Set(excludedSelections);
    if (newSet.has(selection)) {
      newSet.delete(selection);
    } else {
      newSet.add(selection);
    }
    setExcludedSelections(newSet);
  };

  const handleConfirm = () => {
    onConfirm({
      excludedClusters: Array.from(excludedClusters),
      excludedSelections: Array.from(excludedSelections),
    });
  };

  const totalExcluded = excludedClusters.size + excludedSelections.size;

  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      title="Subset Export"
      className="subset-export-dialog"
      canOutsideClickClose={false}
    >
      <div className="subset-dialog-body">
        <Callout intent="primary" icon="info-sign">
          <div style={{ lineHeight: "1.6" }}>
            <strong>选中要删除的cluster/celltype</strong>
            <br />
            低质量群和双细胞群可以选择勾选去除。
            <br />
            如果有Selection工具有选中的细胞这里也会有去除选项。
          </div>
        </Callout>

        <div className="subset-section">
          <h4>Origin Clusters ({clusterList.length})</h4>
          <div className="subset-checkbox-list">
            {clusterList.map((item) => (
              <Checkbox
                key={item.cluster}
                label={`${item.cluster} → ${item.annotation}`}
                checked={excludedClusters.has(item.cluster)}
                onChange={() => handleClusterToggle(item.cluster)}
              />
            ))}
          </div>
        </div>

        {customSelections.length > 0 && (
          <>
            <Divider />
            <div className="subset-section">
              <h4>Custom Selections ({customSelections.length})</h4>
              <div className="subset-checkbox-list">
                {customSelections.map((selection) => {
                  // Display name: cs1 -> Selection 1, cs2 -> Selection 2
                  const displayName = selection.replace('cs', 'Selection ');
                  return (
                    <Checkbox
                      key={selection}
                      label={displayName}
                      checked={excludedSelections.has(selection)}
                      onChange={() => handleSelectionToggle(selection)}
                    />
                  );
                })}
              </div>
            </div>
          </>
        )}

        {totalExcluded > 0 && (
          <Callout intent="warning" style={{ marginTop: "15px" }}>
            {totalExcluded} 项将被排除。
          </Callout>
        )}
      </div>

      <div className="subset-dialog-footer">
        <Button text="取消" onClick={onClose} />
        <Button
          intent="primary"
          text="导出"
          onClick={handleConfirm}
          icon="download"
        />
      </div>
    </Dialog>
  );
};

export default SubsetExportDialog;
