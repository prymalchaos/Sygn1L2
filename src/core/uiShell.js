export function createShell(root) {
  // Read the exposed build version (if any). This is set in pluginLoader.js as
  // window.SYGN_BUILD and used as a cache-busting marker for users to verify
  // that the latest code is loaded. If undefined, version will be empty.
  const version = (typeof window !== "undefined" && window.SYGN_BUILD) ? window.SYGN_BUILD : "";

  root.innerHTML = `
    <style>
      #shell {
        max-width: 1020px;
        margin: 0 auto;
        padding: 14px;
      }
      #shell h1 {
        margin: 0 0 12px 0;
        letter-spacing: 0.22em;
        font-weight: 900;
        font-size: 20px;
        text-transform: uppercase;
        /* sci-fi-ish without external fonts */
        font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif;
        color: rgba(156,255,176,0.92);
        text-shadow:
          0 0 10px rgba(156,255,176,0.22),
          0 0 26px rgba(156,255,176,0.10);
        opacity: 0.95;
        user-select: none;
      }
      #shell h1 span {
        display:inline-block;
        transform: translateY(1px);
      }
      #shell h1 .mark {
        opacity: 0.78;
        letter-spacing: 0.30em;
        margin-left: 6px;
        font-weight: 700;
        font-size: 12px;
      }
      #shell h1 .version {
        opacity: 0.65;
        font-weight: 600;
        font-size: 10px;
        margin-left: 8px;
        letter-spacing: 0.02em;
      }
    </style>
    <div id="shell">
      <h1>
        <span>SYGN1L2</span>
        <span class="mark">CONSOLE</span>
        ${version ? `<span class="version">${version}</span>` : ""}
      </h1>
      <div id="plugin"></div>
    </div>
  `;
  return root.querySelector("#plugin");
}
