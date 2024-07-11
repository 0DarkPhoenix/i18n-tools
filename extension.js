const vscode = require("vscode");
const path = require("node:path");
const fs = require("node:fs/promises");

/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {
	const openAllLanguageVariants = vscode.commands.registerCommand(
		"i18n-tools.openAllLanguageVariants",
		async (uri) => {
			if (!uri || !uri.fsPath) {
				vscode.window.showErrorMessage("No file selected");
				return;
			}

			const filePath = uri.fsPath;
			const parts = filePath.split(path.sep);
			const i18nIndex = parts.lastIndexOf("i18n");

			if (i18nIndex === -1) {
				vscode.window.showErrorMessage("Not an i18n file");
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
						// File doesn't exist, skip
					}
				}

				if (languageFiles.length === 0) {
					vscode.window.showInformationMessage("No corresponding language files found");
					return;
				}

				// Open each language file
				for (const file of languageFiles) {
					const fileUri = vscode.Uri.file(file);
					const doc = await vscode.workspace.openTextDocument(fileUri);
					await vscode.window.showTextDocument(doc, {
						preview: false,
					});
				}
			} catch (error) {
				vscode.window.showErrorMessage(`Error: ${error.message}`);
			}
		},
	);

	const findTranslationItem = vscode.commands.registerCommand(
		"i18n-tools.findTranslationItem",
		async () => {
			const input = await vscode.window.showInputBox({
				placeHolder: "Enter the translation key (e.g., testfile.test.test_words)",
				prompt: "Find Translation Item",
			});

			if (!input) {
				vscode.window.showErrorMessage("No translation key provided");
				return;
			}

			const keys = input.split(".");
			const i18nFolder = `${vscode.workspace.workspaceFolders[0].uri.fsPath}/src/i18n`;

			try {
				const languageFolders = await fs.readdir(i18nFolder, { withFileTypes: true });
				const results = [];

				for (const langFolder of languageFolders) {
					if (langFolder.isDirectory()) {
						let currentPath = `${i18nFolder}/${langFolder.name}`;
						let fileContent;
						let filePath;

						for (let i = 0; i < keys.length; i++) {
							const key = keys[i];
							const foundItem = await findItemRecursive(currentPath, key, i === 0);

							if (!foundItem) {
								break;
							}

							if (foundItem.isFile && foundItem.name.endsWith(".js")) {
								fileContent = await fs.readFile(foundItem.path, "utf-8");
								filePath = foundItem.path;
								break;
							}

							currentPath = foundItem.path;
						}

						if (fileContent) {
							const match = fileContent.match(/=\s*({[\s\S]*?})/);
							if (match) {
								const objectContent = match[1];
								const fileObject = new Function(`return ${objectContent}`)();
								const lastKey = keys[keys.length - 1];
								const value = fileObject[lastKey];

								if (value !== undefined) {
									results.push({ lang: langFolder.name, value, filePath });
									const lineNumber = fileContent
										.split("\n")
										.findIndex((line) => line.includes(lastKey));
									if (lineNumber !== -1) {
										const uri = vscode.Uri.file(filePath);
										const line = fileContent.split("\n")[lineNumber];
										const position = new vscode.Position(
											lineNumber,
											line.length,
										);
										const selection = new vscode.Selection(position, position);
										await vscode.window.showTextDocument(uri, {
											selection,
											preview: false,
										});
									}
								}
							}
						}
					}
				}

				if (results.length > 0) {
					const message = results.map((r) => `${r.lang}: ${r.value}`).join("\n");
					vscode.window.showInformationMessage(`Found values:\n${message}`);
				} else {
					vscode.window.showErrorMessage("No translations found in any language folder");
				}
			} catch (error) {
				vscode.window.showErrorMessage(`Error: ${error.message}`);
			}
		},
	);

	async function findItemRecursive(path, key, isFirstKey) {
		const items = await fs.readdir(path, { withFileTypes: true });
		for (const item of items) {
			if (item.isDirectory()) {
				if (isFirstKey && item.name === key) {
					return { path: `${path}/${item.name}`, isFile: false, name: item.name };
				}
				const nestedResult = await findItemRecursive(
					`${path}/${item.name}`,
					key,
					isFirstKey,
				);
				if (nestedResult) {
					return nestedResult;
				}
			} else if (
				!isFirstKey &&
				item.isFile() &&
				(item.name === `${key}.js` || item.name === key)
			) {
				return { path: `${path}/${item.name}`, isFile: true, name: item.name };
			}
		}
		return null;
	}

	context.subscriptions.push(openAllLanguageVariants);
	context.subscriptions.push(findTranslationItem);
}

module.exports = {
	activate,
};
