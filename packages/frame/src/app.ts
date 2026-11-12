/** The app the frame runs in; names its settings and its log lines. */
let id = "qiew";

/** To be called first, with the binary name (e.g. "xaq"). */
export function setApp(app: string) {
  id = app;
}

export const appId = () => id;
