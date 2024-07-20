const vscode = require("vscode");
const path = require("node:path");
const fs = require("node:fs/promises");
const acorn = require("acorn");
const { simple } = require("acorn-walk");

/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {
	const openAllLanguageVariants = vscode.commands.registerCommand(
		"i18n-tools.openAllLanguageVariants",
		async (uri) => {
			if (!uri || !uri.fsPath) {
				vscode.window.showErrorMessage(
					"No file selected. Please select a file in the Explorer.",
				);
				return;
			}

			const filePath = uri.fsPath;
			const parts = filePath.split(path.sep);
			const i18nIndex = parts.lastIndexOf("i18n");

			if (i18nIndex === -1) {
				vscode.window.showErrorMessage(`Not an i18n file: ${filePath}`);
				return;
			}

			const basePath = parts.slice(0, i18nIndex + 1).join(path.sep);
			const relativePath = parts.slice(i18nIndex + 2).join(path.sep);

			try {
				const languageFolders = await fs.readdir(basePath);
				const languageFiles = [];

				for (const folder of languageFolders) {
					const fullPath = path.join(basePath, folder, relativePath);
					try {
						await fs.access(fullPath);
						languageFiles.push(fullPath);
					} catch (error) {
						throw new Error(`File not found: ${fullPath}`);
					}
				}

				if (languageFiles.length === 0) {
					vscode.window.showInformationMessage(
						`No corresponding language files found for: ${relativePath}`,
					);
					return;
				}

				// Open each language file
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

	const findTranslationItem = vscode.commands.registerCommand(
		"i18n-tools.findTranslationItem",
		async () => {
			const input = await vscode.window.showInputBox({
				placeHolder: "Enter the translation key (e.g., testfile.test.test_words)",
				prompt: "Find Translation Item",
				validateInput: (value) => {
					return value && value.split(".").length > 1
						? null
						: "Please enter a valid translation key with at least two parts separated by dots.";
				},
			});

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
			const languages = await fs.readdir(i18nFolder);

			for (const lang of languages) {
				let currentPath = path.join(i18nFolder, lang, "index.js");
				let currentKey = keys[0];
				let keyIndex = 0;

				while (keyIndex < keys.length - 1) {
					const fileContent = await fs.readFile(currentPath, "utf-8");
					const ast = acorn.parse(fileContent, {
						ecmaVersion: 2020,
						sourceType: "module",
					});

					let nextPath = null;
					simple(ast, {
						ImportDeclaration(node) {
							if (node.specifiers.some((spec) => spec.local.name === currentKey)) {
								nextPath = path.join(
									path.dirname(currentPath),
									`${node.source.value}.js`,
								);
							}
						},
					});

					if (!nextPath) break;

					currentPath = nextPath;
					keyIndex++;
					currentKey = keys[keyIndex];
				}

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
						vscode.window.showInformationMessage(`Translation found: ${result}`);
						return;
					}
				}
			}

			vscode.window.showErrorMessage("Translation not found.");
		},
	);

	context.subscriptions.push(openAllLanguageVariants);
	context.subscriptions.push(findTranslationItem);
}

module.exports = {
	activate,
};
