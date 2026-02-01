import { useEffect, useRef } from "react";
import {
  OverlayToaster,
  Position,
  ProgressBar,
  Classes,
} from "@blueprintjs/core";

import { Tooltip2 } from "@blueprintjs/popover2";

import classNames from "classnames";

const downloadToasterRef = { current: null };

export const DownloadToaster = {
  show: (...args) => downloadToasterRef.current?.show(...args),
  clear: () => downloadToasterRef.current?.clear(),
  dismiss: (key) => downloadToasterRef.current?.dismiss(key),
};

export function DownloadToasterContainer() {
  const ref = useRef(null);

  useEffect(() => {
    downloadToasterRef.current = ref.current;
    return () => {
      downloadToasterRef.current = null;
    };
  }, []);

  return (
    <OverlayToaster
      ref={ref}
      position={Position.TOP_RIGHT}
      className="recipe-toaster"
    />
  );
}

let download_toasters = {};

export function setProgress(id, total, progress) {
  if (total !== null) {
    download_toasters["total"] = total;
    download_toasters["progress"] = progress;
  }

  if (progress !== null) {
    let tprogress =
      (Math.round((progress * 100) / download_toasters["total"]) / 100) * 100;

    download_toasters["progress"] = tprogress;
  }
}

export function renderProgress(progress, url) {
  return {
    icon: "cloud-download",
    message: (
      <>
        <>
          Downloading asset from{" "}
          <Tooltip2
            className={Classes.TOOLTIP_INDICATOR}
            content={<span>{url}</span>}
            minimal={true}
            usePortal={false}
          >
            {new URL(url).hostname}
          </Tooltip2>
        </>
        <ProgressBar
          className={classNames("docs-toast-progress", {
            [Classes.PROGRESS_NO_STRIPES]: progress >= 100,
          })}
          intent={progress < 100 ? "primary" : "success"}
          value={progress / 100}
        />
      </>
    ),
    timeout: progress < 100 ? 0 : 1000,
  };
}
