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
				let currentPath = i18nFolder;
				let fileContent;

				for (let i = 0; i < keys.length; i++) {
					const key = keys[i];
					const isLastKey = i === keys.length - 1;
					const foundItem = await findItemRecursive(currentPath, key, i === 0);

					if (!foundItem) {
						vscode.window.showErrorMessage(
							`Key "${key}" not found in path "${currentPath}"`,
						);
						return;
					}

					if (foundItem.isFile && foundItem.name.endsWith(".js")) {
						fileContent = await fs.readFile(foundItem.path, "utf-8");
						break;
					}

					currentPath = foundItem.path;
				}

				if (fileContent) {
					const fileObject = JSON.parse(fileContent);
					let value = fileObject;

					for (const key of keys.slice(keys.indexOf(key) + 1)) {
						value = value[key];
						if (value === undefined) {
							vscode.window.showErrorMessage(`Key "${key}" not found in object`);
							return;
						}
					}

					vscode.window.showInformationMessage(`Found value: ${value}`);
				} else {
					vscode.window.showErrorMessage("No JavaScript file found");
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

async function findItemRecursive(dir, name) {
	const items = await fs.readdir(dir, { withFileTypes: true });

	for (const item of items) {
		if (item.name === name) {
			return { path: path.join(dir, item.name), isFile: item.isFile() };
		}

		if (item.isDirectory()) {
			const found = await findItemRecursive(path.join(dir, item.name), name);
			if (found) {
				return found;
			}
		}
	}

	return null;
}

module.exports = {
	activate,
};
