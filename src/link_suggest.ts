import { App, Editor, EditorPosition, EditorSuggest, EditorSuggestContext, EditorSuggestTriggerInfo, TFile } from "obsidian";

type LinkSuggestion = TFile & {
	context: EditorSuggestContext
}

export class LinkSuggest extends EditorSuggest<LinkSuggestion> {
	matchLine: number | null;
	currentMatch: RegExpExecArray | null;
    isShown: boolean;
	linkRegex: RegExp;

	constructor(app: App, linkRegex: RegExp) {
		super(app);

        this.isShown = false;
		this.linkRegex = linkRegex;

        this.scope.register([], "tab", (event) => {
            if (this.isShown) {
                // @ts-ignore
                this.suggestions.useSelectedItem(event);
                return false;
            }
        });
	}

	onTrigger(cursor: EditorPosition, editor: Editor, file: TFile | null): EditorSuggestTriggerInfo | null {
		this.matchLine = cursor.line;
		let line = editor.getLine(cursor.line);
		const lastWhiteSpace = /\s/g.exec(line.slice(0, cursor.ch).split("").reverse().join(""))
		console.log(lastWhiteSpace)
		let offset = 0
		if (lastWhiteSpace != null) {
			offset = cursor.ch - lastWhiteSpace.index - 1
			line = line.slice(offset)
			console.log(line)
		}
		// Need to segment line so that the currentMatch is the one that is closest to the cursor on the line
		this.currentMatch = this.linkRegex.exec(line);
		if (this.currentMatch != null) {
            if (cursor.ch == (offset + this.currentMatch.index + this.currentMatch[0].length)) {
                return null;
            }
            this.isShown = true;
			return {
				start: { line: cursor.line, ch: offset + this.currentMatch.index + 2 },
				end: { line: cursor.line, ch: offset + this.currentMatch.index + this.currentMatch[0].length - 2 },
				query: this.currentMatch[1]
			}
		}
        this.isShown = false;
		return null;
	}

	getSuggestions(context: EditorSuggestContext): LinkSuggestion[] | Promise<LinkSuggestion[]> {
		const allFiles = this.app.vault.getMarkdownFiles();
		if (context.query == "") {
			return allFiles.map((file) => {return {...file, context: context}})
		}
		return allFiles.filter((file) => {return file.path.toLowerCase().includes(context.query.toLowerCase())}).map((file) => { return {...file, context: context} });
	}

	renderSuggestion(value: LinkSuggestion, el: HTMLElement): void {
		//el.parentElement?.setAttribute("style", "width: 300px");
		el.createEl("div", { text: value.basename, attr: { "style": "margin-right: 50px"} });
		if (value.name != value.path) {
			el.createEl("small", { text: value.path, attr: { "style": "color: var(--text-muted)" }});
		}
	}

	selectSuggestion(value: LinkSuggestion, evt: MouseEvent | KeyboardEvent): void {
        const replacementValue = value.path.includes("/") ? `${value.path.slice(0, value.path.length - (value.extension.length + 1))}|${value.basename}` : value.basename;
        value.context.editor.replaceRange(
			replacementValue,
			value.context.start,
			value.context.end
		);
        const newCursorPosition = { line: value.context.start.line, ch: value.context.start.ch + replacementValue.length + 2 }
		value.context.editor.setCursor(newCursorPosition);
	}
}