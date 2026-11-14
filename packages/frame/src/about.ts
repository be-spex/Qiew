/**
 * The About box, the same in every app: name and purpose, the file endings
 * the app is made for, whether it is the default viewer, and links to the
 * be spex website and to the app's releases. Its button is the last one in
 * the toolbar. The backend part is `qiew_frame::about`.
 */
import { invoke } from "@tauri-apps/api/core";

interface About {
  name: string;
  say: string;
  ipa: string;
  version: string;
  purpose: string;
  extensions: string[];
  is_default: boolean | null;
}

const ICON = `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5" /><path d="M12 11v5.5" /><circle cx="12" cy="7.8" r="1.1" class="fill" /></svg>`;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className = "", text = "") {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

function link(text: string, target: "website" | "releases") {
  const a = el("a", "", text);
  a.href = "#";
  a.addEventListener("click", (e) => {
    e.preventDefault();
    invoke("open_about_link", { link: target }).catch(() => {});
  });
  return a;
}

function row(label: string, value: string) {
  const fragment = document.createDocumentFragment();
  fragment.append(el("dt", "", label), el("dd", "", value));
  return fragment;
}

async function open(dialog: HTMLDialogElement) {
  const about = await invoke<About>("about_info");
  const box = el("div", "about-box");

  // How to say the name: the slanted banner the website puts on the app's card.
  const say = el("p", "about-say", `say “${about.say}” `);
  say.title = `${about.name} is pronounced like “${about.say}”`;
  say.append(el("span", "", `/${about.ipa}/`));

  const head = el("div", "about-head");
  const title = el("div");
  const name = el("h2", "", about.name);
  name.append(el("span", "about-version", about.version));
  title.append(name, el("p", "", about.purpose));
  head.append(title);
  // The app's own icon, which its page names as its favicon.
  const icon = document.querySelector<HTMLLinkElement>('link[rel="icon"]')?.href;
  if (icon) {
    const img = el("img", "about-icon");
    img.src = icon;
    img.alt = "";
    head.append(img);
  }

  const facts = el("dl");
  facts.append(row("Files", about.extensions.join("  ")));
  if (about.is_default !== null) {
    facts.append(row("Default viewer", about.is_default ? `Yes – these files open in ${about.name}` : "No"));
  }

  const links = el("div", "about-links");
  links.append(link("be spex website", "website"), link(`${about.name} releases on GitHub`, "releases"));

  const close = el("button", "about-close", "Close");
  close.addEventListener("click", () => dialog.close());

  box.append(say, head, facts, links, close);
  dialog.replaceChildren(box);
  dialog.showModal();
  close.focus();
}

/** Adds the About button as the last one of the toolbar. */
export function initAbout() {
  const right = document.querySelector("#toolbar .tb-right");
  if (!right) return;
  const button = el("button", "tb-btn");
  button.id = "about-btn";
  button.title = button.ariaLabel = "About";
  button.innerHTML = ICON;

  const dialog = el("dialog", "about");
  // A click beside the box closes it.
  dialog.addEventListener("click", (e) => {
    if (e.target === dialog) dialog.close();
  });
  document.body.append(dialog);
  button.addEventListener("click", () => open(dialog).catch((err) => console.error("about:", err)));
  right.append(button);
}
