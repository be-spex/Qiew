import "./styles.css";
import { setApp } from "@qiew/frame/app";
import { initViewer } from "@qiew/frame/viewer";
import { initFilter } from "./filter";
import { renderJson } from "./json";

setApp("jayq");

const source = initViewer({
  dropHint: "Drop JSON File Here",
  render: renderJson,
  unit: "Value",
  invalid: "Kein gültiges JSON – Rohansicht.",
});
initFilter(source);
