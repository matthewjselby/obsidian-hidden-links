import { Plugin, TFile } from 'obsidian';
import { ViewPlugin} from "@codemirror/view";
import { LinkSuggest } from './link_suggest';
import { DecorateLinksEditorExtension } from './link_decorate';
import { EditorView } from 'codemirror';

interface HiddenLinksPluginSettings {
	linkRegex: RegExp;
}

const DEFAULT_SETTINGS: HiddenLinksPluginSettings = {
	linkRegex: /\{\{(.*?)\}\}/g
}

export default class HiddenLinksPlugin extends Plugin {
	settings: HiddenLinksPluginSettings;
	decorateLinksEditorExtension: ViewPlugin<DecorateLinksEditorExtension>;
	linkSuggestEditorExtension: LinkSuggest;

	async onload() {
		await this.loadSettings();

		this.decorateLinksEditorExtension = ViewPlugin.define(
			(view: EditorView) => new DecorateLinksEditorExtension(view, this.app, this.settings.linkRegex),
			{ 
				decorations: instance => instance.hiddenLinks
			}
		);
		this.linkSuggestEditorExtension = new LinkSuggest(this.app, this.settings.linkRegex);

		this.registerEditorExtension(this.decorateLinksEditorExtension);
		this.registerEditorSuggest(this.linkSuggestEditorExtension);

		// prevent default context menu on hidden links (allows for showing custom context menu)
		this.registerDomEvent(document, "contextmenu", (event) => {
			if (event.target instanceof HTMLSpanElement && event.target.className.includes("ohl_hidden")) {
				event.preventDefault();
			}
		});

		// markdown post processor to show hidden links in reading mode
		this.registerMarkdownPostProcessor((element, context) => {
			const paragraphs = element.findAll("p");
			for (const p of paragraphs) {
				const newInnerHTML = p.innerHTML.replace(this.settings.linkRegex, (match, g1) => {
					const href = g1.split("|")[0]
					const innerText = g1.includes("|") ? g1.split("|")[1] : g1
					const link = p.createEl("a", { attr: { "data-href": href, "href": href, "class": "internal-link", "target": "_blank", "rel": "noopener" }});
					link.innerText = innerText;
					return link.outerHTML;
				});
				console.log(newInnerHTML);
				p.innerHTML = newInnerHTML;
			}
		});

		// listen for rename events and update links if necessary
		this.app.vault.on("rename", (file, oldPath) => {
			if (file instanceof TFile) {
				for (const mdFile of this.app.vault.getMarkdownFiles()) {
					const prettifiedOldPath = oldPath.endsWith(".md") ? oldPath.slice(0, oldPath.length - 3) : oldPath
					const regex = new RegExp(String.raw`\{\{(${prettifiedOldPath}(\.md)?(\|.*?)?)\}\}`, "g");
					this.app.vault.read(mdFile).then((fileContents) => {
						if (regex.test(fileContents)) {
							const updatedFileContents = fileContents.replace(regex, (match, g1) => {
								const prettifiedFilePath = file.path.slice(0, file.path.length - (file.extension.length + 1))
								let replacement = prettifiedFilePath
								if (g1.includes("|")) {
									replacement += "|"
									const oldBasename = prettifiedOldPath.includes("/") ? prettifiedOldPath.split("/").at(-1) : prettifiedFilePath
									if (g1.split("|")[1] == oldBasename) {
										replacement += file.basename;
									} else if (g1.split("|")[1] == oldBasename + ".md") {
										replacement += file.basename + ".md";
									} else {
										replacement += g1.split("|")[1];
									}
								} else if (g1.endsWith(".md")) {
									replacement += ".md";
								}
								return `{{${replacement}}}`;
							});
							this.app.vault.modify(mdFile, updatedFileContents);
						}
					});
				}
			}
		});
	}

	onunload() {

	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}
