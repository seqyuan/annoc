// kana/src/App.js
import { useContext, useEffect } from "react";

import { AnalysisMode } from "./components/AnalysisMode";
import { ExplorerMode } from "./components/ExploreMode";

import { AppContext } from "./context/AppContext";
import { AppToasterContainer } from "./AppToaster";
import { DownloadToasterContainer } from "./DownloadToaster";

function App() {
  const { appMode, setAppMode, inputFiles } = useContext(AppContext);

  // When a dataset is actually submitted from the landing page,
  // automatically switch into analysis mode.
  useEffect(() => {
    if (appMode === null && inputFiles?.files) {
      setAppMode("analysis");
    }
  }, [appMode, inputFiles, setAppMode]);

  return (
    <>
      <AppToasterContainer />
      <DownloadToasterContainer />
      {appMode === null && <ExplorerMode />}
      {appMode === "analysis" && <AnalysisMode />}
      {appMode === "explore" && <ExplorerMode />}
    </>
  );
}

export default App;
