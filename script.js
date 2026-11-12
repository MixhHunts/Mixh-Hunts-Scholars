"use strict";
/* =====================================================================
   Application Portal – front-end prototype
   ---------------------------------------------------------------------
   1. Backend adapter  (swap the demo localStorage code for Supabase/Firebase)
   2. Form definition  (steps + fields drive rendering and validation)
   3. Validation, navigation, review, submission
   4. Tracking + admin demo
   ===================================================================== */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

/* ---------- 1. BACKEND ADAPTER ---------------------------------------
   DEMO ONLY: data lives in this browser's localStorage. It is NOT a
   database and is not secure. Replace each method body when integrating.
   Supabase example:
     const sb = supabase.createClient(URL, ANON_KEY);
     submit: sb.from("applications").insert(app)   (+ sb.storage for files)
     list:   sb.from("applications").select("*")   (admin only, via RLS)
   Firebase example: addDoc(collection(db,"applications"), app) and
     uploadBytes(ref(storage, path), file) for documents.
   Admin methods must be protected by authentication + server-side rules. */
const KEY = "demo_applications";
const read = () => { try { return JSON.parse(localStorage.getItem(KEY)) || []; } catch { return []; } };
const Backend = {
  async submit(app, fileObjects) { /* TODO: upload fileObjects to storage, then insert app */
    const all = read(); all.unshift(app); localStorage.setItem(KEY, JSON.stringify(all)); return { ok: true };
  },
  async find(ref) { /* TODO: query by reference number (public, limited fields) */
    return read().find(a => a.ref === ref.trim().toUpperCase()) || null;
  },
  async list() { /* TODO: admin-only query */ return read(); },
  async setStatus(ref, status) { /* TODO: admin-only update */
    const all = read(); const a = all.find(x => x.ref === ref); if (a) a.status = status;
    localStorage.setItem(KEY, JSON.stringify(all));
  }
};

/* ---------- 2. FORM DEFINITION -------------------------------------- */
const STATES = "Abia,Adamawa,Akwa Ibom,Anambra,Bauchi,Bayelsa,Benue,Borno,Cross River,Delta,Ebonyi,Edo,Ekiti,Enugu,Gombe,Imo,Jigawa,Kaduna,Kano,Katsina,Kebbi,Kogi,Kwara,Lagos,Nasarawa,Niger,Ogun,Ondo,Osun,Oyo,Plateau,Rivers,Sokoto,Taraba,Yobe,Zamfara,FCT Abuja".split(",");
const F = (id, label, type = "text", o = {}) => ({ id, label, type, req: true, ...o });
const IMG = ["image/jpeg", "image/png"], DOC = [...IMG, "application/pdf"];
const STEPS = [
  { title: "Personal", fields: [
    F("fullName", "Full name", "text", { wide: 1, auto: "name" }),
    F("dob", "Date of birth", "date"),
    F("gender", "Gender", "select", { opts: ["Female", "Male", "Prefer not to say"] }),
    F("nationality", "Nationality", "text", { auto: "country-name" }),
    F("phone", "Phone number", "tel", { auto: "tel", ph: "08012345678" }),
    F("email", "Email address", "email", { wide: 1, auto: "email" }),
    F("address", "Residential address", "textarea", { wide: 1 }),
    F("state", "State", "select", { opts: STATES }),
    F("lga", "Local Government Area", "text") ] },
  { title: "Education", fields: [
    F("qualification", "Highest qualification", "select", { opts: ["SSCE / WAEC / NECO", "OND / NCE", "HND", "Bachelor's degree", "Master's degree", "Doctorate", "Other"] }),
    F("institution", "Name of institution"),
    F("course", "Course of study"),
    F("gradYear", "Year of graduation", "number", { ph: "2020" }),
    F("certs", "Educational certificates", "textarea", { wide: 1, ph: "List each certificate you hold, e.g. B.Sc. Computer Science, 2020" }) ] },
  { title: "Additional", fields: [
    F("category", "Application category", "select", { opts: ["Scholarship", "Internship", "Membership", "Grant", "Other"] }),
    F("reason", "Reason for applying", "textarea", { wide: 1, min: 30, ph: "Tell us why you are applying (at least 30 characters)" }),
    F("experience", "Previous experience", "textarea", { wide: 1, req: false, ph: "Optional – relevant work, volunteering or projects" }),
    F("ecName", "Emergency contact name"),
    F("ecRelation", "Relationship to you"),
    F("ecPhone", "Emergency contact phone", "tel", { wide: 1 }) ] },
  { title: "Documents", fields: [
    F("passport", "Passport photograph", "file", { types: IMG, hint: "a JPG or PNG image", max: 2 }),
    F("idDoc", "Identification document", "file", { types: DOC, hint: "a JPG, PNG or PDF", max: 3 }),
    F("certFiles", "Educational certificates (scans)", "file", { types: DOC, hint: "a JPG, PNG or PDF", max: 3, multiple: 1 }),
    F("otherDocs", "Other supporting documents", "file", { req: false, types: DOC, hint: "a JPG, PNG or PDF", max: 3, multiple: 1 }) ] }
];
const REVIEW_STEP = STEPS.length; // index of the review panel
let current = 0;
const fileStore = {}; // File objects kept in memory until a backend uploads them

function fieldHTML(f) {
  const a = `id="${f.id}" name="${f.id}" ${f.req ? "required" : ""} aria-describedby="${f.id}-err" ${f.auto ? `autocomplete="${f.auto}"` : ""}`;
  let c;
  if (f.type === "select") c = `<select ${a}><option value="">Select…</option>${f.opts.map(o => `<option>${esc(o)}</option>`).join("")}</select>`;
  else if (f.type === "textarea") c = `<textarea ${a} rows="3" placeholder="${esc(f.ph || "")}"></textarea>`;
  else if (f.type === "file") c = `<input type="file" ${a} accept="${f.types.join(",")}" ${f.multiple ? "multiple" : ""}><small class="hint">${f.hint}, up to ${f.max} MB${f.multiple ? " each" : ""}</small>`;
  else c = `<input type="${f.type}" ${a} placeholder="${esc(f.ph || "")}" ${f.type === "number" ? 'inputmode="numeric"' : ""}>`;
  return `<div class="field ${f.wide ? "wide" : ""}"><label for="${f.id}">${f.label}${f.req ? "" : " (optional)"}</label>${c}<small class="err" id="${f.id}-err" role="alert"></small></div>`;
}

function build() {
  $("#panels").innerHTML = STEPS.map((s, i) =>
    `<section class="panel" id="p${i}" hidden><h2>Step ${i + 1}: ${s.title === "Additional" ? "Additional information" : s.title === "Documents" ? "Upload documents" : s.title + " information"}</h2><div class="grid">${s.fields.map(fieldHTML).join("")}</div></section>`).join("") +
    `<section class="panel" id="p${REVIEW_STEP}" hidden><h2>Step 5: Review and submit</h2><div id="review"></div>
      <label class="check"><input type="checkbox" id="declare"> I declare that the information and documents I have provided are true and complete.</label>
      <small class="err" id="declare-err" role="alert"></small></section>`;
  $("#stepper").innerHTML = [...STEPS.map(s => s.title), "Review"].map((t, i) => `<li id="s${i}"><span>${i + 1}</span>${t}</li>`).join("");
  $$("#panels input, #panels select, #panels textarea").forEach(el => {
    el.addEventListener("blur", () => { const f = fieldById(el.id); if (f) showErr(f); });
    el.addEventListener("input", () => el.classList.remove("bad"));
    if (el.type === "file") el.addEventListener("change", () => { fileStore[el.id] = [...el.files]; const f = fieldById(el.id); showErr(f); });
  });
  const dob = $("#dob"); dob.max = new Date().toISOString().slice(0, 10);
}
const ALL = STEPS.flatMap(s => s.fields);
const fieldById = id => ALL.find(f => f.id === id);

/* ---------- 3. VALIDATION ------------------------------------------- */
function check(f) {
  const el = $("#" + f.id), v = el.value.trim();
  if (f.type === "file") {
    const files = [...el.files];
    if (!files.length) return f.req ? "Please choose a file to upload." : "";
    for (const x of files) {
      if (!f.types.includes(x.type)) return `"${x.name}" must be ${f.hint}.`;
      if (x.size > f.max * 1048576) return `"${x.name}" is larger than ${f.max} MB.`;
    }
    return "";
  }
  if (!v) return f.req ? "This field is required." : "";
  if (f.type === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v)) return "Enter a valid email address, like name@example.com.";
  if (f.type === "tel" && !/^\+?\d[\d\s-]{8,16}$/.test(v)) return "Enter a valid phone number, like 08012345678.";
  if (f.id === "dob") {
    const d = new Date(v), now = new Date(); let age = now.getFullYear() - d.getFullYear();
    if (now < new Date(now.getFullYear(), d.getMonth(), d.getDate())) age--;
    if (isNaN(d) || d > now) return "Enter a valid date of birth in the past.";
    if (age < 16) return "Applicants must be at least 16 years old.";
  }
  if (f.id === "gradYear" && !(+v >= 1960 && +v <= new Date().getFullYear() + 5)) return "Enter a valid four-digit year, like 2020.";
  if (f.min && v.length < f.min) return `Please write at least ${f.min} characters (you have ${v.length}).`;
  return "";
}
function showErr(f) {
  const msg = check(f); $("#" + f.id + "-err").textContent = msg; $("#" + f.id).classList.toggle("bad", !!msg); return !msg;
}
const validateStep = i => STEPS[i].fields.map(showErr).every(Boolean);
function focusFirstError() { const b = $(".panel:not([hidden]) .bad"); if (b) b.focus(); }

/* ---------- NAVIGATION ---------------------------------------------- */
function go(i) {
  current = i;
  $$(".panel").forEach((p, n) => p.hidden = n !== i);
  $$("#stepper li").forEach((li, n) => { li.classList.toggle("done", n < i); li.classList.toggle("on", n === i); li.toggleAttribute("aria-current", n === i); });
  $("#bar").style.width = (i / REVIEW_STEP) * 100 + "%";
  $("#prev").hidden = i === 0; $("#next").hidden = i === REVIEW_STEP; $("#submit").hidden = i !== REVIEW_STEP;
  if (i === REVIEW_STEP) renderReview();
  $("#apply").scrollIntoView({ behavior: "smooth", block: "start" });
}
function values() { const o = {}; ALL.filter(f => f.type !== "file").forEach(f => o[f.id] = $("#" + f.id).value.trim()); return o; }
function fileMeta() { const o = {}; ALL.filter(f => f.type === "file").forEach(f => o[f.id] = [...$("#" + f.id).files].map(x => ({ name: x.name, size: x.size, type: x.type }))); return o; }

function summaryHTML(vals, files, editable = false) {
  return STEPS.map((s, i) => `<div class="rev"><div class="rev-h"><h3>${s.title}</h3>${editable ? `<button type="button" class="link" data-edit="${i}">Edit</button>` : ""}</div><dl>` +
    s.fields.map(f => {
      let v = f.type === "file" ? (files[f.id].map(x => esc(x.name)).join(", ") || "None") : esc(vals[f.id]) || "Not provided";
      return `<dt>${f.label}</dt><dd>${v}</dd>`;
    }).join("") + "</dl></div>").join("");
}
function renderReview() { $("#review").innerHTML = summaryHTML(values(), fileMeta(), true); }
document.addEventListener("click", e => { const b = e.target.closest("[data-edit]"); if (b) go(+b.dataset.edit); });

$("#next").addEventListener("click", () => { if (validateStep(current)) go(current + 1); else focusFirstError(); });
$("#prev").addEventListener("click", () => go(current - 1));

/* ---------- SUBMISSION ---------------------------------------------- */
function newRef() {
  const r = crypto.getRandomValues(new Uint32Array(1))[0].toString(36).toUpperCase().padStart(6, "0").slice(0, 6);
  return `APP-${new Date().getFullYear()}-${r}`;
}
$("#appForm").addEventListener("submit", async e => {
  e.preventDefault();
  for (let i = 0; i < STEPS.length; i++) if (!validateStep(i)) { go(i); focusFirstError(); toast("Some required information is missing or invalid. Please fix the highlighted fields."); return; }
  if (!$("#declare").checked) { $("#declare-err").textContent = "Tick the declaration to submit your application."; return; }
  $("#declare-err").textContent = "";
  const btn = $("#submit"); btn.disabled = true; btn.textContent = "Submitting…";
  const app = { ref: newRef(), submittedAt: new Date().toISOString(), status: "Pending", values: values(), files: fileMeta() };
  try {
    await Backend.submit(app, fileStore); // files are NOT stored in this demo, only their names
    showDone(app); toast("Application submitted successfully.");
    e.target.reset(); Object.keys(fileStore).forEach(k => delete fileStore[k]);
  } catch (err) { toast("Submission failed. Please try again."); }
  btn.disabled = false; btn.textContent = "Submit application";
});
function showDone(app) {
  $("#refno").textContent = app.ref;
  $("#printSummary").innerHTML = `<p><strong>Reference:</strong> ${app.ref}<br><strong>Submitted:</strong> ${new Date(app.submittedAt).toLocaleString()}<br><strong>Status:</strong> ${app.status}</p>` + summaryHTML(app.values, app.files);
  show("done");
}

/* ---------- VIEWS + UI ---------------------------------------------- */
function show(view) {
  ["home", "apply", "done", "admin"].forEach(v => $("#" + v).hidden = v !== view);
  if (view === "apply") go(0);
  if (view === "admin") renderAdmin();
  if (view !== "apply") window.scrollTo({ top: 0, behavior: "smooth" });
  $("#menu").classList.remove("open"); $("#burger").setAttribute("aria-expanded", "false");
}
document.addEventListener("click", e => {
  const v = e.target.closest("[data-view]"); if (v) { e.preventDefault(); show(v.dataset.view); }
  const a = e.target.closest("[data-anchor]"); if (a) { e.preventDefault(); show("home"); setTimeout(() => $("#" + a.dataset.anchor).scrollIntoView({ behavior: "smooth" }), 50); }
});
$("#burger").addEventListener("click", () => { const o = $("#menu").classList.toggle("open"); $("#burger").setAttribute("aria-expanded", o); });
let t; function toast(m) { const el = $("#toast"); el.textContent = m; el.classList.add("on"); clearTimeout(t); t = setTimeout(() => el.classList.remove("on"), 4000); }
$("#printBtn").addEventListener("click", () => window.print());

/* ---------- 4. TRACKING + ADMIN (demo) ------------------------------ */
$("#trackForm").addEventListener("submit", async e => {
  e.preventDefault();
  const a = await Backend.find($("#trackRef").value);
  $("#trackOut").innerHTML = a ? `<span class="pill ${a.status}">${a.status}</span> Application <strong>${esc(a.ref)}</strong> for ${esc(a.values.fullName)}, submitted ${new Date(a.submittedAt).toLocaleDateString()}.`
    : "No application found with that reference number on this device. Check the number and try again.";
});
async function renderAdmin() {
  const q = $("#search").value.trim().toLowerCase(), list = (await Backend.list()).filter(a => !q || (a.ref + a.values.fullName + a.values.email).toLowerCase().includes(q));
  $("#adminRows").innerHTML = list.length ? list.map(a => `<tr><td>${esc(a.ref)}</td><td>${esc(a.values.fullName)}<br><small>${esc(a.values.email)}</small></td><td>${esc(a.values.category)}</td><td><span class="pill ${a.status}">${a.status}</span></td>
    <td class="acts"><button data-st="Approved" data-ref="${a.ref}">Approve</button><button data-st="Rejected" data-ref="${a.ref}">Reject</button><button data-st="Pending" data-ref="${a.ref}">Reset</button></td></tr>`).join("")
    : `<tr><td colspan="5" class="empty">No applications yet. Submit one from the Apply page and it will appear here.</td></tr>`;
}
$("#search").addEventListener("input", renderAdmin);
$("#adminRows").addEventListener("click", async e => { const b = e.target.closest("[data-st]"); if (b) { await Backend.setStatus(b.dataset.ref, b.dataset.st); renderAdmin(); } });

build();
$("#year").textContent = new Date().getFullYear();
