const vscode = require("vscode");
const path = require("node:path");
const fs = require("node:fs/promises");
const acorn = require("acorn");
const { simple } = require("acorn-walk");

/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {
	let configState = {
		openLanguagesInOrder: [],
	};

	function initializeConfig() {
		const config = vscode.workspace.getConfiguration("i18nTools");

		configState = {
			openLanguagesInOrder: config.get("openLanguagesInOrder", []),
		};

		return configState;
	}

	// Initialize the settings for this extension as a config
	initializeConfig();

	// Update config when any of the settings for this extension is changed
	vscode.workspace.onDidChangeConfiguration((event) => {
		if (event.affectsConfiguration("i18nTools")) {
			initializeConfig();
		}
	});

	// Register the command to open all language variants of an i18n file
	const openAllLanguageVariants = vscode.commands.registerCommand(
		"i18nTools.openAllLanguageVariants",
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

			// Store the original active document URI
			const originalUri = vscode.window.activeTextEditor?.document.uri;

			const basePath = parts.slice(0, i18nIndex + 1).join(path.sep);
			const relativePath = parts.slice(i18nIndex + 2).join(path.sep);

			try {
				const items = await fs.readdir(basePath);
				const languageFolders = await Promise.all(
					items.map(async (item) => {
						const fullPath = path.join(basePath, item);
						const stat = await fs.stat(fullPath);
						return stat.isDirectory() ? item : null;
					}),
				);
				const validLanguageFolders = languageFolders.filter(Boolean);
				const languageFoldersOrderList = configState.openLanguagesInOrder;
				let sortedLanguageFolders = [];

				if (languageFoldersOrderList.length > 0) {
					sortedLanguageFolders = validLanguageFolders.sort((a, b) => {
						const indexA = languageFoldersOrderList.indexOf(a);
						const indexB = languageFoldersOrderList.indexOf(b);

						if (indexA !== -1 && indexB !== -1) {
							return indexA - indexB;
						}

						if (indexA !== -1) return -1;
						if (indexB !== -1) return 1;

						return a.localeCompare(b);
					});
				} else {
					sortedLanguageFolders = validLanguageFolders.sort();
				}

				const languageFiles = [];

				for (const folder of sortedLanguageFolders) {
					const fullPath = path.join(basePath, folder, relativePath);
					try {
						await fs.access(fullPath);
						languageFiles.push(fullPath);
					} catch (error) {
						vscode.window.showErrorMessage(`File not found: ${fullPath}`);
					}
				}

				if (languageFiles.length === 0) {
					vscode.window.showInformationMessage(
						`No corresponding language files found for: ${relativePath}`,
					);
					return;
				}

				// First close all related language files that are already open
				for (const file of languageFiles) {
					const fileUri = vscode.Uri.file(file);
					const doc = await vscode.workspace.openTextDocument(fileUri);
					const tabs = await vscode.window.tabGroups.all.flatMap((g) => g.tabs);
					const existingTab = tabs.find(
						(tab) =>
							tab.input instanceof vscode.TabInputText &&
							tab.input.uri.fsPath === fileUri.fsPath,
					);
					if (existingTab) {
						await vscode.window.tabGroups.close(existingTab);
					}
				}

				// Then open all files in the correct order
				for (const file of languageFiles) {
					const fileUri = vscode.Uri.file(file);
					const doc = await vscode.workspace.openTextDocument(fileUri);
					await vscode.window.showTextDocument(doc, { preview: false });
				}

				// Finally, if we had an original file, switch back to it
				if (originalUri) {
					const doc = await vscode.workspace.openTextDocument(originalUri);
					await vscode.window.showTextDocument(doc, { preserveFocus: true });
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
		"i18nTools.findTranslationItem",
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

			// Create a Map to cache file contents
			const fileCache = new Map();

			const getFileContent = async (filePath) => {
				if (fileCache.has(filePath)) {
					return fileCache.get(filePath);
				}
				const content = await fs.readFile(filePath, "utf-8");
				fileCache.set(filePath, content);
				return content;
			};

			const findInAST = (ast, currentKey) => {
				let nextPath = null;
				let foundKey = false;

				simple(ast, {
					ImportDeclaration(node) {
						if (
							!foundKey &&
							node.specifiers.some((spec) => spec.local.name === currentKey)
						) {
							nextPath = node.source.value;
							foundKey = true;
						}
					},
					ObjectExpression(node) {
						if (!foundKey) {
							for (const prop of node.properties) {
								if (
									prop.key.name === currentKey &&
									prop.value.type === "ObjectExpression"
								) {
									foundKey = true;
									break;
								}
							}
						}
					},
				});

				return { nextPath, foundKey };
			};

			const searchPromises = languages.map(async (lang) => {
				let currentPath = path.join(i18nFolder, lang, "index.js");

				// Create a local copy of keys for each language search
				let remainingKeys = [...keys];
				let keyIndex = 0;
				let currentKey = remainingKeys[keyIndex];

				try {
					while (keyIndex < remainingKeys.length - 1) {
						const fileContent = await getFileContent(currentPath);

						const ast = acorn.parse(fileContent, {
							ecmaVersion: 2020,
							sourceType: "module",
							locations: true,
						});

						const { nextPath, foundKey } = findInAST(ast, currentKey);

						if (!foundKey) {
							break;
						}

						if (nextPath) {
							currentPath = path.join(path.dirname(currentPath), `${nextPath}.js`);
							// Update remaining keys based on the found import
							remainingKeys = remainingKeys.slice(keyIndex + 1);
							keyIndex = 0;
						} else {
							keyIndex++;
						}

						currentKey = remainingKeys[keyIndex];
					}

					if (keyIndex === remainingKeys.length - 1) {
						const fileContent = await getFileContent(currentPath);

						const ast = acorn.parse(fileContent, {
							ecmaVersion: 2020,
							sourceType: "module",
							locations: true,
						});

						let result = null;
						simple(ast, {
							ObjectExpression(node) {
								if (!result) {
									const findValue = (obj, keyPath, depth = 0) => {
										if (depth >= keyPath.length) return null;

										for (const prop of obj.properties) {
											if (prop.key.name === remainingKeys[depth]) {
												if (depth === remainingKeys.length - 1) {
													return {
														value: prop.value.value,
														lineNumber: prop.loc.start.line - 1,
													};
												}
												if (prop.value.type === "ObjectExpression") {
													return findValue(
														prop.value,
														remainingKeys,
														depth + 1,
													);
												}
											}
										}
										return null;
									};

									result = findValue(node, remainingKeys);
									if (result) {
									}
								}
							},
						});

						if (result) {
							return {
								path: currentPath,
								...result,
							};
						}
					}
				} catch (error) {
					console.error(`Error processing ${lang}:`, error);
					console.error("Stack trace:", error.stack);
				}
				return null;
			});
			const timeoutPromise = new Promise((resolve) => setTimeout(() => resolve(null), 5000));
			const allResults = await Promise.race([Promise.all(searchPromises), timeoutPromise]);

			if (allResults) {
				// Filter out null results and process each valid result
				const validResults = allResults.filter((result) => result !== null);

				for (const results of validResults) {
					const fileUri = vscode.Uri.file(results.path);
					const document = await vscode.workspace.openTextDocument(fileUri);
					const editor = await vscode.window.showTextDocument(document, {
						preview: false,
					});

					const position = new vscode.Position(
						results.lineNumber,
						document.lineAt(results.lineNumber).text.length,
					);
					editor.selection = new vscode.Selection(position, position);
					editor.revealRange(new vscode.Range(position, position));
				}

				vscode.window.showInformationMessage(
					`Found ${validResults.length} translations successfully.`,
				);
			} else {
				vscode.window.showWarningMessage("Translation not found or search timed out.");
			}
		},
	);

	// Add the commands to the context's subscriptions
	context.subscriptions.push(openAllLanguageVariants);
	context.subscriptions.push(findTranslationItem);
}

module.exports = {
	activate,
};
