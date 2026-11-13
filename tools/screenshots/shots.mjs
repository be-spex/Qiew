// What to photograph. One entry per image on the website and in the READMEs.
//
//   app     which frontend (apps/<app>)
//   name    file name without theme suffix, e.g. "jayq" -> jayq-light.png, jayq-dark.png
//   file    demo file to open (tools/screenshots/demo)
//   width   window width in CSS pixels (images are taken at 2x); height likewise
//   views   optional: use another colour scheme for a theme, e.g. { dark: "nord" }
//   steps   what to do after the file is open:
//             { split: true }                  open the split view (Jayq, Xaq)
//             { filter: "<jq filter>" }        type it into the editor and run it
//             { stylesheet: "<xsl>" }          same for Xaq (runs in the browser's XSLTProcessor)
//             { click: "#selector" }           click an element
//             { wait: 200 }                    wait (ms)
//   jq      jq filters that appear in steps, run with the real engine ahead of time

export const THEMES = {
  light: "soft-light",
  dark: "soft-dark",
  sepia: "sepia",
  nord: "nord",
};

// The themes every image is taken in unless --theme says otherwise.
export const DEFAULT_THEMES = ["light", "dark"];

const VIEWER = { width: 860, height: 620 };
const SPLIT = { width: 1440, height: 620 };

export const SHOTS = [
  {
    app: "marq", name: "marq", file: "Trail-Notes.md", ...VIEWER, views: { dark: "nord" },
    steps: [],
  },
  {
    app: "xaq", name: "xaq", file: "orders.xml", ...VIEWER, views: { dark: "nord" },
    steps: [],
  },
  {
    app: "xaq", name: "xaq-split", file: "orders.xml", ...SPLIT, views: { dark: "nord" },
    steps: [
      { split: true },
      {
        stylesheet: `<?xml version="1.0" encoding="UTF-8"?>
<!-- Open orders with their totals -->
<xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
  <xsl:output method="xml" indent="yes"/>

  <xsl:template match="/orders">
    <open week="{@week}">
      <xsl:apply-templates
          select="order[@status='open']"/>
    </open>
  </xsl:template>

  <xsl:template match="order">
    <order id="{@id}" city="{customer/city}">
      <customer>
        <xsl:value-of select="customer/name"/>
      </customer>
      <total>
        <xsl:value-of select="format-number(
            sum(items/item/@price), '0.00')"/>
      </total>
    </order>
  </xsl:template>
</xsl:stylesheet>
`,
      },
    ],
  },
  {
    app: "jayq", name: "jayq", file: "stations.json", ...VIEWER, views: { dark: "nord" },
    steps: [],
  },
  {
    app: "jayq", name: "jayq-split", file: "stations.json", ...SPLIT, views: { dark: "nord" },
    steps: [
      { split: true },
      {
        filter: `# Online stations with their gusts, strongest first
.stations
| map(select(.online))
| map({name, temp, gust: .wind.gust})
| sort_by(-.gust)
`,
      },
    ],
  },
];
