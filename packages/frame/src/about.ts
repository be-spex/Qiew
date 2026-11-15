/**
 * The About box, the same in every app: name and purpose, the file endings
 * the app is made for, whether it is the default viewer, and links to the
 * be spex website and to the app's releases. It opens from the toolbar's menu
 * (see toolbar.ts). The backend part is `qiew_frame::about`.
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

let dialog: HTMLDialogElement | null = null;

/** Opens the About box. */
export function showAbout() {
  if (!dialog) {
    dialog = el("dialog", "about");
    // A click beside the box closes it.
    dialog.addEventListener("click", (e) => {
      if (e.target === dialog) dialog?.close();
    });
    document.body.append(dialog);
  }
  open(dialog).catch((err) => console.error("about:", err));
}
