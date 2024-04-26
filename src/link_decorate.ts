import { App, Menu, TFile, editorLivePreviewField } from "obsidian";
import { EditorView } from "codemirror";
import { PluginValue, Decoration, DecorationSet, MatchDecorator, ViewUpdate, WidgetType } from "@codemirror/view";
import { syntaxTree } from "@codemirror/language";
import { EditorSelection, StateEffect } from "@codemirror/state";

export class HiddenLinkWidget extends WidgetType {
    linkName: string;
    linkPath: string;
    isUnresolved: boolean;
    app: App;
    
    private resolvedClass = "cm-link cm-underline ohl_hidden";
    private unresolvedClass = "cm-link cm-underline is-unresolved ohl_hidden";

    constructor(fileName: string, filePath: string, isUnresolved: boolean, app: App) {
        super();
        this.linkName = fileName;
        this.linkPath = filePath;
        this.isUnresolved = isUnresolved;
        this.app = app;
    }

    openLink(openInNewTab: boolean) {
        this.app.workspace.openLinkText(this.linkPath, "", openInNewTab);
    }

    createFileAndOpenLink(openInNewTab: boolean) {
        this.app.vault.create(this.linkPath, "");
        this.openLink(openInNewTab);
    }

    toDOM(view: EditorView): HTMLElement {
        const linkWrapper = document.createElement("span");
        linkWrapper.className = this.isUnresolved ?
            this.unresolvedClass :
            this.resolvedClass;
        linkWrapper.setAttribute("path", this.linkPath);
        linkWrapper.setAttribute("tabindex", "-1");
        if (this.linkName.includes("|")) {
            linkWrapper.innerText = this.linkName.split("|")[1];
        } else {
            linkWrapper.innerText = this.linkName;
        }
        linkWrapper.onClickEvent((event) => {
            if (!this.isUnresolved) {
                this.openLink(false);
            } else if (event.metaKey) {
                this.createFileAndOpenLink(false);
            }
        });
        linkWrapper.addEventListener("contextmenu", (event) => {
            const menu = new Menu();

            if (!this.isUnresolved) {
                menu.addItem((item) => {
                    item.setTitle("Open link");
                    item.onClick(() => {
                        this.openLink(false);
                    });
                });
    
                menu.addItem((item) => {
                    item.setTitle("Open in new tab");
                    item.onClick(() => {
                        this.openLink(true);
                    });
                });
            } else {
                menu.addItem((item) => {
                    item.setTitle("Create this file");
                    item.onClick(() => {
                        this.createFileAndOpenLink(false);
                        this.isUnresolved = false;
                        linkWrapper.className = this.resolvedClass;
                    })
                });

                menu.addItem((item) => {
                    item.setTitle("Create this file & open in new tab");
                    item.onClick(() => {
                        this.createFileAndOpenLink(true);
                        this.isUnresolved = false;
                        linkWrapper.className = this.resolvedClass;
                    });
                });
            }

            menu.showAtMouseEvent(event);
        });
        linkWrapper.on
        linkWrapper.style.cursor = "pointer";
        return linkWrapper;
    }
}

class HiddenLinkMatchDecorator extends MatchDecorator {
    private lastSelectionFrom: number;
    private lastSelectionTo: number;

    updateDeco(update: ViewUpdate, deco: DecorationSet) {
        let updateFrom;
        let updateTo;

        if (update.docChanged) {
            ({ updateFrom, updateTo } = this.updateChanges(update));
        } else if (update.selectionSet) {
            ({ updateFrom, updateTo } = this.updateSelection(update));
        }

        if (updateTo && updateFrom && updateTo - updateFrom <= 1000) {
            return this['updateRange'](update.view, deco.map(update.changes), updateFrom, updateTo);
        } else if (update.viewportChanged) {
            return this.createDeco(update.view);
        }
        return deco;
    }

    private updateChanges(update: ViewUpdate) {
        let updateFrom = 1e9;
        let updateTo = -1;

        update.changes.iterChanges((_f, _t, from, to) => {
            if (to > update.view.viewport.from && from < update.view.viewport.to) {
                updateFrom = update.state.doc.lineAt(Math.min(from, updateFrom)).from;
                updateTo = update.state.doc.lineAt(Math.max(to, updateTo)).to;
            }
        });
        return { updateFrom, updateTo };
    }

    /*
     * updateSelection returns a range to update when a selection has been made
     * to the document, suchas a moving the cursor of selecting multiple character and line
     */
    private updateSelection(update: ViewUpdate) {
        const selection = update.state.selection.ranges;

        // Get the earliest and latest positon of the lines in the selected range
        const lineFrom = update.state.doc.lineAt(selection[0].from).from;
        const lineTo = update.state.doc.lineAt(selection[selection.length - 1].to).to;

        // Return the earliest and latest postions of the current and previous selection range
        const updateFrom = Math.min(lineFrom, this.lastSelectionFrom);
        const updateTo = Math.max(lineTo, this.lastSelectionTo);

        // Retain the current selected range for the next update
        this.lastSelectionFrom = lineFrom;
        this.lastSelectionTo = lineTo;

        return { updateFrom, updateTo };
    }
}

export class DecorateLinksEditorExtension implements PluginValue {
    hiddenLinks: DecorationSet;
    hiddenLinkMatcher: MatchDecorator;
    app: App;
    linkRegex: RegExp;

    constructor(view: EditorView, app: App, linkRegex: RegExp) {
        this.app = app;
        this.linkRegex = linkRegex;
        this.hiddenLinkMatcher = new HiddenLinkMatchDecorator({
            regexp: linkRegex,
            decorate: (add, from, to, match, view): void => {
                if (this.isCodeblock(view, from, to)) return;
                if (this.selectionAndRangeOverlap(view.state.selection, from, to)) {
                    add(from, from + 2, Decoration.mark({ class: "cm-formatting-link cm-formatting-link-start", attributes: { "spellcheck": "false" }}));
                    if (match[0].length > 4) {
                        add(from + 2, to - 2, Decoration.mark({ attributes: { "style": "color: var(--link-color)" }}));
                    }
                    add(to - 2, to, Decoration.mark({ class: "cm-formatting-link cm-formatting-link-end", attributes: { "spellcheck": "false" }}));
                    return;
                }

                const linkName = match[1];
                const matchingFile = this.fileFromName(linkName);

                if (matchingFile != undefined) {
                    add(from, to, Decoration.replace({ widget: new HiddenLinkWidget(linkName, matchingFile.path, false, this.app) }));
                } else {
                    add(from, to, Decoration.replace({ widget: new HiddenLinkWidget(linkName, linkName.endsWith(".md") ? linkName : `${linkName}.md`, true, this.app) }));
                }
            },
        });
        this.hiddenLinks = this.hiddenLinkMatcher.createDeco(view);
    }

    private fileFromName(fileName: string): TFile | undefined {
        return this.app.vault.getMarkdownFiles().find((file) => {
            if (fileName.includes("|")) {
                return file.path.toLowerCase() == fileName.split("|")[0].toLowerCase() || file.path.slice(0, file.path.length - (file.extension.length + 1)).toLowerCase() == fileName.split("|")[0].toLowerCase();
            } else {
                return file.path.toLowerCase() == fileName.toLowerCase() || file.path.slice(0, file.path.length - (file.extension.length + 1)).toLowerCase() == fileName.toLowerCase();
            }
        });
    }

    private isCodeblock(view: EditorView, from: number, to: number): boolean {
        let isCodeblock = false;
        syntaxTree(view.state).iterate({
            from,
            to,
            enter: (node) => {
                if (/^inline-code/.test(node.name) || node.name == 'HyperMD-codeblock_HyperMD-codeblock-bg') {
                    isCodeblock = true;
                    return false; // short circuit child iteration
                }
            },
        });
        return isCodeblock;
    }

    private selectionAndRangeOverlap(selection: EditorSelection, rangeFrom: number, rangeTo: number): boolean {
        for (const range of selection.ranges) {
            if (range.from <= rangeTo && range.to >= rangeFrom) {
                return true;
            }
        }
        return false;
    }

    update(update: ViewUpdate) {
        const isSourceMode = !update.state.field(editorLivePreviewField);
        const isEditorLayoutChanged = update.transactions.some((t) =>
            t.effects.some((e) => e.is(StateEffect.define<null>())),
        );

        if (isSourceMode || isEditorLayoutChanged) {
            this.hiddenLinks = this.initializeDecorations(update.view);
            return;
        }

        this.hiddenLinks = this.hiddenLinkMatcher.updateDeco(update, this.hiddenLinks);
    }

    private initializeDecorations(view: EditorView): DecorationSet {
        return view.state.field(editorLivePreviewField) ? this.hiddenLinkMatcher.createDeco(view) : Decoration.none;
    }
}