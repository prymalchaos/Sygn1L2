import { supabase } from "../../core/supabaseClient.js";

export default {
  id: "phase0_onboarding",

  mount(root, api) {
    root.innerHTML = `
      <h2>Login / Sign Up</h2>
      <input id="email" placeholder="Email"><br>
      <input id="password" type="password" placeholder="Password"><br>
      <button id="login">Continue</button>
    `;

    root.querySelector("#login").onclick = async () => {
      const email = root.querySelector("#email").value;
      const password = root.querySelector("#password").value;

      await supabase.auth.signInWithPassword({ email, password })
        .catch(() => supabase.auth.signUp({ email, password }));

      api.setPhase("phase1");
    };
  }
};