import "./styles.css";
import { setApp } from "@qiew/frame/app";
import { initViewer } from "@qiew/frame/viewer";
import { initMapping } from "./mapping";
import { renderXml } from "./xml";

setApp("xaq");

const source = initViewer({
  dropHint: "Drop XML File Here",
  render: renderXml,
  unit: "Element",
  invalid: "Kein wohlgeformtes XML – Rohansicht.",
});
initMapping(source);
