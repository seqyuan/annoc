import { useEffect, useRef } from "react";
import { OverlayToaster, Position } from "@blueprintjs/core";

const toasterRef = { current: null };

export const AppToaster = {
  show: (props) => toasterRef.current?.show(props),
  clear: () => toasterRef.current?.clear(),
  dismiss: (key) => toasterRef.current?.dismiss(key),
};

export function AppToasterContainer() {
  const ref = useRef(null);

  useEffect(() => {
    toasterRef.current = ref.current;
    return () => {
      toasterRef.current = null;
    };
  }, []);

  return (
    <OverlayToaster
      ref={ref}
      position={Position.TOP_RIGHT}
      className="notifications"
      maxToasts={5}
    />
  );
}
