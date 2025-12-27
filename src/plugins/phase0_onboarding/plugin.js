import { supabase } from "../../core/supabaseClient.js";

function el(html) {
  const t = document.createElement("template");
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

async function getUserId() {
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error) throw error;
  return user?.id ?? null;
}

export default {
  id: "phase0_onboarding",

  mount(root, api) {
    const state = api.getState();
    const step = state.phases.phase0_onboarding?.step || "auth";

    const wrap = el(`
      <div style="max-width:520px; margin: 0 auto; padding: 14px;">
        <div style="border:1px solid rgba(215,255,224,0.18); border-radius:12px; padding:14px; background: rgba(10,14,18,0.7);">
          <h2 style="margin:0 0 10px 0; letter-spacing:0.06em;">ONBOARDING</h2>
          <div id="content"></div>
          <div id="msg" style="margin-top:10px; opacity:0.9; font-size:13px;"></div>
        </div>
      </div>
    `);

    const msg = wrap.querySelector("#msg");
    const content = wrap.querySelector("#content");

    function setMsg(text) {
      msg.textContent = text || "";
    }

    async function showAuth() {
      content.innerHTML = "";
      setMsg("");

      const view = el(`
        <div>
          <div style="display:flex; gap:10px; margin-bottom:10px;">
            <button id="modeLogin">Login</button>
            <button id="modeSignup">Sign up</button>
          </div>

          <div style="display:grid; gap:10px;">
            <input id="email" placeholder="Email" inputmode="email" autocomplete="email" style="padding:10px; border-radius:10px; border:1px solid rgba(215,255,224,0.2); background:#05070a; color:#d7ffe0;">
            <input id="password" type="password" placeholder="Password" autocomplete="current-password" style="padding:10px; border-radius:10px; border:1px solid rgba(215,255,224,0.2); background:#05070a; color:#d7ffe0;">
            <button id="go" style="padding:10px; border-radius:10px;">Continue</button>
          </div>

          <div style="margin-top:10px; font-size:13px; opacity:0.85;">
            No email confirmation is required for this project.
          </div>
        </div>
      `);

      let mode = "login";

      const modeLogin = view.querySelector("#modeLogin");
      const modeSignup = view.querySelector("#modeSignup");
      const go = view.querySelector("#go");
      const emailEl = view.querySelector("#email");
      const passEl = view.querySelector("#password");

      function refreshButtons() {
        modeLogin.disabled = mode === "login";
        modeSignup.disabled = mode === "signup";
        go.textContent = mode === "login" ? "Login" : "Sign up";
      }

      modeLogin.onclick = () => { mode = "login"; refreshButtons(); };
      modeSignup.onclick = () => { mode = "signup"; refreshButtons(); };
      refreshButtons();

      go.onclick = async () => {
        setMsg("Working…");
        const email = emailEl.value.trim();
        const password = passEl.value;

        try {
          if (!email || !password) {
            setMsg("Please enter email and password.");
            return;
          }

          if (mode === "login") {
            const { error } = await supabase.auth.signInWithPassword({ email, password });
            if (error) throw error;
          } else {
            const { error } = await supabase.auth.signUp({ email, password });
            if (error) throw error;
          }

          // After auth, route to username creation if needed.
          const next = api.getState();
          next.phases.phase0_onboarding.step = "username";
          api.setState(next);
          await api.setPhase("phase0_onboarding");
          setMsg("");
          showUsername();
        } catch (e) {
          setMsg(e?.message || String(e));
        }
      };

      content.appendChild(view);
    }

    async function showUsername() {
      content.innerHTML = "";
      setMsg("");

      const view = el(`
        <div style="display:grid; gap:10px;">
          <div style="font-size:13px; opacity:0.85;">
            Choose a username. It must be unique.
          </div>

          <input id="username" placeholder="Username" autocomplete="nickname"
            style="padding:10px; border-radius:10px; border:1px solid rgba(215,255,224,0.2); background:#05070a; color:#d7ffe0;">

          <button id="create" style="padding:10px; border-radius:10px;">Create profile</button>
          <button id="logout" style="padding:10px; border-radius:10px; opacity:0.9;">Logout</button>
        </div>
      `);

      const usernameEl = view.querySelector("#username");
      const createBtn = view.querySelector("#create");
      const logoutBtn = view.querySelector("#logout");

      logoutBtn.onclick = async () => {
        await supabase.auth.signOut();
      };

      createBtn.onclick = async () => {
        setMsg("Creating profile…");
        try {
          const username = usernameEl.value.trim();
          if (username.length < 3) {
            setMsg("Username must be at least 3 characters.");
            return;
          }

          const userId = await getUserId();
          if (!userId) {
            setMsg("Not logged in.");
            return;
          }

          const { error } = await supabase
            .from("profiles")
            .insert({ id: userId, username, role: "player" });

          if (error) {
            // Unique violation typically shows as a constraint error.
            if ((error.message || "").toLowerCase().includes("duplicate")
              || (error.message || "").toLowerCase().includes("unique")) {
              setMsg("That username is taken. Try another.");
              return;
            }
            throw error;
          }

          setMsg("Profile created. Entering Phase 1…");
          await api.setPhase("phase1");
        } catch (e) {
          setMsg(e?.message || String(e));
        }
      };

      content.appendChild(view);
    }

    root.appendChild(wrap);

    // Render correct step
    if (step === "username") showUsername();
    else showAuth();
  },
};