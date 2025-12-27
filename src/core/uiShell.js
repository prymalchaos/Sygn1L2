export function createShell(root) {
  root.innerHTML = `
    <div id="shell">
      <h1>SYGN1L2</h1>
      <div id="plugin"></div>
    </div>
  `;
  return root.querySelector("#plugin");
}