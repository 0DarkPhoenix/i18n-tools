const vscode = require("vscode");
const path = require("node:path");
const fs = require("node:fs/promises");
const acorn = require("acorn");
const { simple } = require("acorn-walk");

/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {
	// Register the command to open all language variants of an i18n file
	const openAllLanguageVariants = vscode.commands.registerCommand(
		"i18n-tools.openAllLanguageVariants",
		async (uri) => {
			// Check if a file is selected
			if (!uri || !uri.fsPath) {
				vscode.window.showErrorMessage(
					"No file selected. Please select a file in the Explorer.",
				);
				return;
			}

			const filePath = uri.fsPath;
			const parts = filePath.split(path.sep);
			const i18nIndex = parts.lastIndexOf("i18n");

			// Check if the selected file is within an i18n directory
			if (i18nIndex === -1) {
				vscode.window.showErrorMessage(`Not an i18n file: ${filePath}`);
				return;
			}

			const basePath = parts.slice(0, i18nIndex + 1).join(path.sep);
			const relativePath = parts.slice(i18nIndex + 2).join(path.sep);

			try {
				// Read the i18n directory to find language folders
				const languageFolders = await fs.readdir(basePath);
				const languageFiles = [];

				// Check if the corresponding language file exists in each language folder
				for (const folder of languageFolders) {
					const fullPath = path.join(basePath, folder, relativePath);
					try {
						await fs.access(fullPath);
						languageFiles.push(fullPath);
					} catch (error) {
						throw new Error(`File not found: ${fullPath}`);
					}
				}

				// If no corresponding language files are found, show a message
				if (languageFiles.length === 0) {
					vscode.window.showInformationMessage(
						`No corresponding language files found for: ${relativePath}`,
					);
					return;
				}

				// Open each corresponding language file in a new editor tab
				for (const file of languageFiles) {
					try {
						const fileUri = vscode.Uri.file(file);
						const doc = await vscode.workspace.openTextDocument(fileUri);
						await vscode.window.showTextDocument(doc, { preview: false });
					} catch (error) {
						vscode.window.showErrorMessage(
							`Failed to open file: ${file}. Error: ${error.message}`,
						);
					}
				}
			} catch (error) {
				vscode.window.showErrorMessage(
					`Error reading directory: ${basePath}. Error: ${error.message}`,
				);
			}
		},
	);

	// Register the command to find a translation item
	const findTranslationItem = vscode.commands.registerCommand(
		"i18n-tools.findTranslationItem",
		async () => {
			const editor = vscode.window.activeTextEditor;
			if (!editor) {
				vscode.window.showErrorMessage("No active editor found.");
				return;
			}

			const document = editor.document;
			const position = editor.selection.active;
			const line = document.lineAt(position.line).text;
			const translationKeyRegex = /t\(['"](.+?)['"]\)/;

			let input;
			const lineMatch = line.match(translationKeyRegex);
			if (lineMatch) {
				const startIndex = line.indexOf(lineMatch[0]);
				const endIndex = startIndex + lineMatch[0].length;
				if (position.character >= startIndex && position.character <= endIndex) {
					input = lineMatch[1];
				}
			}

			// Prompt the user to enter a translation key if not found in the current line
			if (!input) {
				input = await vscode.window.showInputBox({
					placeHolder: "Enter the translation key (e.g., testfile.test.test_words)",
					prompt: "Find Translation Item",
					validateInput: (value) => {
						return value && value.split(".").length > 1
							? null
							: "Please enter a valid translation key with at least two parts separated by dots.";
					},
				});
			}

			if (!input) {
				vscode.window.showErrorMessage("No translation key provided. Operation cancelled.");
				return;
			}

			const keys = input.split(".");
			const workspaceFolders = vscode.workspace.workspaceFolders;
			if (!workspaceFolders || workspaceFolders.length === 0) {
				vscode.window.showErrorMessage(
					"No workspace folder found. Please open a folder and try again.",
				);
				return;
			}

			const i18nFolder = path.join(workspaceFolders[0].uri.fsPath, "src", "i18n");
			const items = await fs.readdir(i18nFolder);
			const items_evaluation = await Promise.all(
				items.map(async (item) => {
					const stat = await fs.stat(path.join(i18nFolder, item));
					return stat.isDirectory() ? item : null;
				}),
			);
			const languages = items_evaluation.filter(Boolean);

			// Iterate through each language folder to find the translation key
			for (const lang of languages) {
				let currentPath = path.join(i18nFolder, lang, "index.js");
				let currentKey = keys[0];
				let keyIndex = 0;

				// Traverse the key path to find the final translation value
				while (keyIndex < keys.length - 1) {
					const fileContent = await fs.readFile(currentPath, "utf-8");
					const ast = acorn.parse(fileContent, {
						ecmaVersion: 2020,
						sourceType: "module",
					});

					let nextPath = null;
					let foundKey = false;

					simple(ast, {
						ImportDeclaration(node) {
							if (node.specifiers.some((spec) => spec.local.name === currentKey)) {
								nextPath = path.join(
									path.dirname(currentPath),
									`${node.source.value}.js`,
								);
								foundKey = true;
							}
						},
						Property(node) {
							if (
								node.key.name === currentKey &&
								node.value.type === "ObjectExpression"
							) {
								// If the current key is found and it points to an object, continue traversal
								foundKey = true;
							}
						},
					});

					if (!foundKey) break;

					if (nextPath) {
						currentPath = nextPath;
					}
					keyIndex++;
					currentKey = keys[keyIndex];
				}

				// If the final key is found, open the corresponding file and highlight the translation
				if (keyIndex === keys.length - 1) {
					const fileContent = await fs.readFile(currentPath, "utf-8");
					const ast = acorn.parse(fileContent, {
						ecmaVersion: 2020,
						sourceType: "module",
					});

					let result = null;
					simple(ast, {
						ObjectExpression(node) {
							let current = node;
							for (let i = keyIndex; i < keys.length; i++) {
								const property = current.properties.find(
									(p) => p.key.name === keys[i],
								);
								if (!property) return;
								if (i === keys.length - 1) {
									result = property.value.value;
									return;
								}
								current = property.value;
							}
						},
					});

					if (result) {
						const fileUri = vscode.Uri.file(currentPath);
						const document = await vscode.workspace.openTextDocument(fileUri);
						const editor = await vscode.window.showTextDocument(document, {
							preview: false,
						});

						const text = document.getText();
						const lines = text.split("\n");
						const positions = [];

						lines.forEach((line, lineIndex) => {
							if (line.includes(result)) {
								const position = new vscode.Position(lineIndex, line.length);
								positions.push(position);
							}
						});

						if (positions.length > 0) {
							const selections = positions.map(
								(position) => new vscode.Selection(position, position),
							);
							editor.selections = selections;
							editor.revealRange(new vscode.Range(positions[0], positions[0]));
						}
					}
				}
			}

			vscode.window.showInformationMessage("Translation found successfully.");
		},
	);

	// Add the commands to the context's subscriptions
	context.subscriptions.push(openAllLanguageVariants);
	context.subscriptions.push(findTranslationItem);
}

module.exports = {
	activate,
};
