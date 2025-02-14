#!/usr/bin/env node
'use strict';

var tslib = require('tslib');
var chalk = require('chalk');
var commandLineArgs = require('command-line-args');
var fs = require('fs');
var glob = require('glob');
var path = require('path');
var cosmiconfig = require('cosmiconfig');
var compilerSfc = require('@vue/compiler-sfc');
var gettextExtractor = require('gettext-extractor');
var validate = require('gettext-extractor/dist/utils/validate');
var selector = require('gettext-extractor/dist/html/selector');
var content = require('gettext-extractor/dist/utils/content');
var parse5 = require('parse5');
var treeAdapter = require('parse5-htmlparser2-tree-adapter');
var typescript = require('typescript');
var child_process = require('child_process');

function _interopDefaultLegacy (e) { return e && typeof e === 'object' && 'default' in e ? e : { 'default': e }; }

var chalk__default = /*#__PURE__*/_interopDefaultLegacy(chalk);
var commandLineArgs__default = /*#__PURE__*/_interopDefaultLegacy(commandLineArgs);
var fs__default = /*#__PURE__*/_interopDefaultLegacy(fs);
var glob__default = /*#__PURE__*/_interopDefaultLegacy(glob);
var path__default = /*#__PURE__*/_interopDefaultLegacy(path);
var treeAdapter__default = /*#__PURE__*/_interopDefaultLegacy(treeAdapter);

var loadConfig = function (cliArgs) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o;
    var moduleName = "gettext";
    var explorer = cosmiconfig.cosmiconfigSync(moduleName);
    var configRes;
    if (cliArgs === null || cliArgs === void 0 ? void 0 : cliArgs.config) {
        configRes = explorer.load(cliArgs.config);
        if (!configRes) {
            throw new Error("Config not found: ".concat(cliArgs.config));
        }
    }
    else {
        configRes = explorer.search();
    }
    var config = configRes === null || configRes === void 0 ? void 0 : configRes.config;
    var languagePath = ((_a = config.output) === null || _a === void 0 ? void 0 : _a.path) || "./src/language";
    var joinPath = function (inputPath) { return path__default["default"].join(languagePath, inputPath); };
    var joinPathIfRelative = function (inputPath) {
        if (!inputPath) {
            return undefined;
        }
        return path__default["default"].isAbsolute(inputPath) ? inputPath : path__default["default"].join(languagePath, inputPath);
    };
    return {
        input: {
            path: ((_b = config.input) === null || _b === void 0 ? void 0 : _b.path) || "./src",
            include: ((_c = config.input) === null || _c === void 0 ? void 0 : _c.include) || ["**/*.js", "**/*.ts", "**/*.vue"],
            exclude: ((_d = config.input) === null || _d === void 0 ? void 0 : _d.exclude) || [],
            jsExtractorOpts: (_e = config.input) === null || _e === void 0 ? void 0 : _e.jsExtractorOpts,
            compileTemplate: ((_f = config.input) === null || _f === void 0 ? void 0 : _f.compileTemplate) || false,
        },
        output: {
            path: languagePath,
            potPath: joinPathIfRelative((_g = config.output) === null || _g === void 0 ? void 0 : _g.potPath) || joinPath("./messages.pot"),
            jsonPath: joinPathIfRelative((_h = config.output) === null || _h === void 0 ? void 0 : _h.jsonPath) ||
                (((_j = config.output) === null || _j === void 0 ? void 0 : _j.splitJson) ? joinPath("./") : joinPath("./translations.json")),
            locales: ((_k = config.output) === null || _k === void 0 ? void 0 : _k.locales) || ["en"],
            flat: ((_l = config.output) === null || _l === void 0 ? void 0 : _l.flat) === undefined ? false : config.output.flat,
            linguas: ((_m = config.output) === null || _m === void 0 ? void 0 : _m.linguas) === undefined ? true : config.output.linguas,
            splitJson: ((_o = config.output) === null || _o === void 0 ? void 0 : _o.splitJson) === undefined ? false : config.output.splitJson,
        },
    };
};

function attributeEmbeddedJsExtractor(selector, jsParser) {
    validate.Validate.required.nonEmptyString({ selector: selector });
    validate.Validate.required.argument({ jsParser: jsParser });
    return function (node, fileName, _, lineNumberStart) {
        if (typeof node.tagName !== "string") {
            return;
        }
        var element = node;
        element.attrs.forEach(function (attr) {
            var _a, _b;
            var startLine = (_b = (_a = element.sourceCodeLocation) === null || _a === void 0 ? void 0 : _a.attrs[attr.name]) === null || _b === void 0 ? void 0 : _b.startLine;
            if (startLine) {
                lineNumberStart = lineNumberStart + startLine - 1;
            }
            jsParser.parseString(attr.value, fileName, {
                lineNumberStart: lineNumberStart,
            });
        });
    };
}

var getElementContent = function (element, options) {
    var content$1 = parse5.serialize(element, {});
    // text nodes within template tags don't get serialized properly, this is a hack
    if (element.tagName === "template") {
        var docFragment_1 = treeAdapter__default["default"].createDocumentFragment();
        element.content.childNodes.forEach(function (childNode) {
            treeAdapter__default["default"].appendChild(docFragment_1, childNode);
        });
        content$1 = parse5.serialize(docFragment_1, {});
    }
    // Un-escape characters that get escaped by parse5
    content$1 = content$1.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
    return content.normalizeContent(content$1, options);
};
function embeddedJsExtractor(selector$1, jsParser) {
    validate.Validate.required.nonEmptyString({ selector: selector$1 });
    validate.Validate.required.argument({ jsParser: jsParser });
    var selectors = new selector.ElementSelectorSet(selector$1);
    return function (node, fileName, _, lineNumberStart) {
        if (typeof node.tagName !== "string") {
            return;
        }
        var element = node;
        if (selectors.anyMatch(element)) {
            var source = getElementContent(element, {
                trimWhiteSpace: false,
                preserveIndentation: true,
                replaceNewLines: false,
            });
            if (element.sourceCodeLocation && element.sourceCodeLocation.startLine) {
                lineNumberStart = lineNumberStart + element.sourceCodeLocation.startLine - 1;
            }
            jsParser.parseString(source, fileName, {
                scriptKind: typescript.ScriptKind.Deferred,
                lineNumberStart: lineNumberStart,
            });
        }
    };
}

var extractFromFiles = function (filePaths, potPath, config) { return tslib.__awaiter(void 0, void 0, void 0, function () {
    var extr, emptyExtractors, extractors, jsParser, htmlParser;
    var _a, _b;
    return tslib.__generator(this, function (_c) {
        switch (_c.label) {
            case 0:
                extr = new gettextExtractor.GettextExtractor();
                emptyExtractors = new Array();
                extractors = ((_b = (_a = config === null || config === void 0 ? void 0 : config.input) === null || _a === void 0 ? void 0 : _a.jsExtractorOpts) === null || _b === void 0 ? void 0 : _b.reduce(function (acc, item, index, array) {
                    console.log("custom keyword: ".concat(chalk__default["default"].blueBright(item.keyword)));
                    acc.push(gettextExtractor.JsExtractors.callExpression([item.keyword, "[this].".concat(item.keyword)], item.options));
                    return acc;
                }, emptyExtractors)) || emptyExtractors;
                jsParser = extr.createJsParser(tslib.__spreadArray([
                    gettextExtractor.JsExtractors.callExpression(["$gettext", "[this].$gettext"], {
                        content: {
                            replaceNewLines: "\n",
                        },
                        arguments: {
                            text: 0,
                        },
                    }),
                    gettextExtractor.JsExtractors.callExpression(["$ngettext", "[this].$ngettext"], {
                        content: {
                            replaceNewLines: "\n",
                        },
                        arguments: {
                            text: 0,
                            textPlural: 1,
                        },
                    }),
                    gettextExtractor.JsExtractors.callExpression(["$pgettext", "[this].$pgettext"], {
                        content: {
                            replaceNewLines: "\n",
                        },
                        arguments: {
                            context: 0,
                            text: 1,
                        },
                    }),
                    gettextExtractor.JsExtractors.callExpression(["$npgettext", "[this].$npgettext"], {
                        content: {
                            replaceNewLines: "\n",
                        },
                        arguments: {
                            context: 0,
                            text: 1,
                            textPlural: 2,
                        },
                    })
                ], extractors, true));
                htmlParser = extr.createHtmlParser([
                    gettextExtractor.HtmlExtractors.elementContent("translate, [v-translate]", {
                        content: {
                            trimWhiteSpace: true,
                            // TODO: figure out newlines for component
                            replaceNewLines: " ",
                        },
                        attributes: {
                            textPlural: "translate-plural",
                            context: "translate-context",
                            comment: "translate-comment",
                        },
                    }),
                    attributeEmbeddedJsExtractor("[*=*]", jsParser),
                    embeddedJsExtractor("*", jsParser),
                ]);
                return [4 /*yield*/, Promise.all(filePaths.map(function (fp) { return tslib.__awaiter(void 0, void 0, void 0, function () {
                        var buffer, _a, descriptor_1, errors;
                        return tslib.__generator(this, function (_b) {
                            switch (_b.label) {
                                case 0: return [4 /*yield*/, new Promise(function (res, rej) {
                                        return fs__default["default"].readFile(fp, "utf-8", function (err, data) {
                                            if (err) {
                                                rej(err);
                                            }
                                            res(data);
                                        });
                                    })];
                                case 1:
                                    buffer = _b.sent();
                                    // TODO: make file extensions and parsers configurable
                                    if (fp.endsWith(".vue")) {
                                        _a = compilerSfc.parse(buffer, {
                                            filename: fp,
                                            sourceRoot: process.cwd(),
                                        }), descriptor_1 = _a.descriptor, errors = _a.errors;
                                        if (errors.length > 0) {
                                            errors.forEach(function (e) { return console.error(e); });
                                        }
                                        if (descriptor_1.template) {
                                            htmlParser.parseString("<template>".concat(descriptor_1.template.content, "</template>"), descriptor_1.filename, {
                                                lineNumberStart: descriptor_1.template.loc.start.line,
                                                transformSource: function (code) {
                                                    var _a, _b, _c;
                                                    var lang = ((_b = (_a = descriptor_1 === null || descriptor_1 === void 0 ? void 0 : descriptor_1.template) === null || _a === void 0 ? void 0 : _a.lang) === null || _b === void 0 ? void 0 : _b.toLowerCase()) || "html";
                                                    if (!((_c = config.input) === null || _c === void 0 ? void 0 : _c.compileTemplate) || lang === "html") {
                                                        return code;
                                                    }
                                                    var compiledTemplate = compilerSfc.compileTemplate({
                                                        filename: descriptor_1 === null || descriptor_1 === void 0 ? void 0 : descriptor_1.filename,
                                                        source: code,
                                                        preprocessLang: lang,
                                                        id: descriptor_1 === null || descriptor_1 === void 0 ? void 0 : descriptor_1.filename,
                                                    });
                                                    return compiledTemplate.source;
                                                },
                                            });
                                        }
                                        if (descriptor_1.script) {
                                            jsParser.parseString(descriptor_1.script.content, descriptor_1.filename, {
                                                lineNumberStart: descriptor_1.script.loc.start.line,
                                            });
                                        }
                                        if (descriptor_1.scriptSetup) {
                                            jsParser.parseString(descriptor_1.scriptSetup.content, descriptor_1.filename, {
                                                lineNumberStart: descriptor_1.scriptSetup.loc.start.line,
                                            });
                                        }
                                    }
                                    else if (fp.endsWith(".html")) {
                                        htmlParser.parseString(buffer, fp);
                                    }
                                    else if (fp.endsWith(".js") || fp.endsWith(".ts") || fp.endsWith(".cjs") || fp.endsWith(".mjs") || fp.endsWith(".tsx")) {
                                        jsParser.parseString(buffer, fp);
                                    }
                                    return [2 /*return*/];
                            }
                        });
                    }); }))];
            case 1:
                _c.sent();
                extr.savePotFile(potPath);
                console.info("".concat(chalk__default["default"].green("Extraction successful"), ", ").concat(chalk__default["default"].blueBright(potPath), " created."));
                extr.printStats();
                return [2 /*return*/];
        }
    });
}); };

function execShellCommand(cmd) {
    return new Promise(function (resolve) {
        child_process.exec(cmd, { env: process.env }, function (error, stdout, stderr) {
            if (error) {
                console.warn(error);
            }
            resolve(stdout ? stdout : stderr);
        });
    });
}

var optionDefinitions = [{ name: "config", alias: "c", type: String }];
var options;
try {
    options = commandLineArgs__default["default"](optionDefinitions);
}
catch (e) {
    console.error(e);
    process.exit(1);
}
var config = loadConfig(options);
var globPromise = function (pattern) {
    return new Promise(function (resolve, reject) {
        try {
            glob__default["default"](pattern, {}, function (er, res) {
                resolve(res);
            });
        }
        catch (e) {
            reject(e);
        }
    });
};
var getFiles = function () { return tslib.__awaiter(void 0, void 0, void 0, function () {
    var allFiles, excludeFiles, filesFlat, excludeFlat;
    var _a;
    return tslib.__generator(this, function (_b) {
        switch (_b.label) {
            case 0: return [4 /*yield*/, Promise.all((_a = config.input) === null || _a === void 0 ? void 0 : _a.include.map(function (pattern) {
                    var searchPath = path__default["default"].join(config.input.path, pattern);
                    console.info("Searching: ".concat(chalk__default["default"].blueBright(searchPath)));
                    return globPromise(searchPath);
                }))];
            case 1:
                allFiles = _b.sent();
                return [4 /*yield*/, Promise.all(config.input.exclude.map(function (pattern) {
                        var searchPath = path__default["default"].join(config.input.path, pattern);
                        console.info("Excluding: ".concat(chalk__default["default"].blueBright(searchPath)));
                        return globPromise(searchPath);
                    }))];
            case 2:
                excludeFiles = _b.sent();
                filesFlat = allFiles.reduce(function (prev, curr) { return tslib.__spreadArray(tslib.__spreadArray([], prev, true), curr, true); }, []);
                excludeFlat = excludeFiles.reduce(function (prev, curr) { return tslib.__spreadArray(tslib.__spreadArray([], prev, true), curr, true); }, []);
                excludeFlat.forEach(function (file) {
                    var index = filesFlat.indexOf(file);
                    if (index !== -1) {
                        filesFlat.splice(index, 1);
                    }
                });
                return [2 /*return*/, filesFlat];
        }
    });
}); };
console.info("Input directory: ".concat(chalk__default["default"].blueBright(config.input.path)));
console.info("Output directory: ".concat(chalk__default["default"].blueBright(config.output.path)));
console.info("Output POT file: ".concat(chalk__default["default"].blueBright(config.output.potPath)));
console.info("Locales: ".concat(chalk__default["default"].blueBright(config.output.locales)));
console.info();
(function () { return tslib.__awaiter(void 0, void 0, void 0, function () {
    var files, _i, _a, loc, poDir, poFile, isFile, linguasPath;
    return tslib.__generator(this, function (_b) {
        switch (_b.label) {
            case 0: return [4 /*yield*/, getFiles()];
            case 1:
                files = _b.sent();
                console.info();
                files.forEach(function (f) { return console.info(chalk__default["default"].grey(f)); });
                console.info();
                return [4 /*yield*/, extractFromFiles(files, config.output.potPath, config)];
            case 2:
                _b.sent();
                _i = 0, _a = config.output.locales;
                _b.label = 3;
            case 3:
                if (!(_i < _a.length)) return [3 /*break*/, 9];
                loc = _a[_i];
                poDir = config.output.flat ? config.output.path : path__default["default"].join(config.output.path, loc);
                poFile = config.output.flat ? path__default["default"].join(poDir, "".concat(loc, ".po")) : path__default["default"].join(poDir, "app.po");
                fs__default["default"].mkdirSync(poDir, { recursive: true });
                isFile = fs__default["default"].existsSync(poFile) && fs__default["default"].lstatSync(poFile).isFile();
                if (!isFile) return [3 /*break*/, 5];
                return [4 /*yield*/, execShellCommand("msgmerge --lang=".concat(loc, " --update ").concat(poFile, " ").concat(config.output.potPath, " --backup=off"))];
            case 4:
                _b.sent();
                console.info("".concat(chalk__default["default"].green("Merged"), ": ").concat(chalk__default["default"].blueBright(poFile)));
                return [3 /*break*/, 8];
            case 5: 
            // https://www.gnu.org/software/gettext/manual/html_node/msginit-Invocation.html
            // msginit will set Plural-Forms header if the locale is in the
            // [embedded table](https://github.com/dd32/gettext/blob/master/gettext-tools/src/plural-table.c#L27)
            // otherwise it will read [$GETTEXTCLDRDIR/common/supplemental/plurals.xml](https://raw.githubusercontent.com/unicode-org/cldr/main/common/supplemental/plurals.xml)
            // so execShellCommand should pass the env(GETTEXTCLDRDIR) to child process
            return [4 /*yield*/, execShellCommand("msginit --no-translator --locale=".concat(loc, " --input=").concat(config.output.potPath, " --output-file=").concat(poFile))];
            case 6:
                // https://www.gnu.org/software/gettext/manual/html_node/msginit-Invocation.html
                // msginit will set Plural-Forms header if the locale is in the
                // [embedded table](https://github.com/dd32/gettext/blob/master/gettext-tools/src/plural-table.c#L27)
                // otherwise it will read [$GETTEXTCLDRDIR/common/supplemental/plurals.xml](https://raw.githubusercontent.com/unicode-org/cldr/main/common/supplemental/plurals.xml)
                // so execShellCommand should pass the env(GETTEXTCLDRDIR) to child process
                _b.sent();
                fs__default["default"].chmodSync(poFile, 438);
                return [4 /*yield*/, execShellCommand("msgattrib --no-wrap --no-obsolete -o ".concat(poFile, " ").concat(poFile))];
            case 7:
                _b.sent();
                console.info("".concat(chalk__default["default"].green("Created"), ": ").concat(chalk__default["default"].blueBright(poFile)));
                _b.label = 8;
            case 8:
                _i++;
                return [3 /*break*/, 3];
            case 9:
                if (config.output.linguas === true) {
                    linguasPath = path__default["default"].join(config.output.path, "LINGUAS");
                    fs__default["default"].writeFileSync(linguasPath, config.output.locales.join(" "));
                    console.info();
                    console.info("".concat(chalk__default["default"].green("Created"), ": ").concat(chalk__default["default"].blueBright(linguasPath)));
                }
                return [2 /*return*/];
        }
    });
}); })();
