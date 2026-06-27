const LanguageParser = require("parser.js");

/**
 * ActionScript 3 Parser
 * @extends LanguageParser
 */

class ActionScriptParser extends LanguageParser {

    constructor(config) {
        /**
         * Language specific settings
         * @type Object
         * @property {string} language
         * @property {string} varIdentifier - Valid chars for vars/args
         * @property {string} fnIdentifier  - Valid chars for functions
         * @property {string} clsIdentifier - Valid chars for classes
         * @property {string} typeInfo      - Format of param type
         * @property {Object} tags          - Language specific tags
         */
        const validChars = "[a-zA-Z_$][a-zA-Z_$0-9]*";
        const settings = {
            language: "actionscript",
            varIdentifier: validChars,
            fnIdentifier: validChars,
            clsIdentifier: validChars,
            typeInfo: "{%s}",
            tags: {
                keySummary: "summary",
                keyVar: "@type",
                keyRet: "@return"
            },
            commentStyle: "/**"
        };
        super(settings);

        // Get the custom config for this parser to adjust the style of setter docs
        this.setterStyle = config.as3SetterDocStyle;
    }

    /**
     * Override to handle ASDoc conventions for getters/setters.
     * - Getters use @return (not @type) with the getter's declared type
     * - Setters either only return @private (ASDoc default), or get only @param, no @return tag
     */
    createFunctionBlock(fnName, fnType, fnArgs, retType, throwArgs) {
        if (fnType === "getter") {
            const out = [];
            out.push([this.settings.tags.keySummary]);
            // Use the getter's declared return type as @return
            if (retType) {
                out.push([this.settings.tags.keyRet, this.formatType(retType), "", "description"]);
            }
            return out;
        }

        if (fnType === "setter") {
            const out = [];
            if(this.setterStyle!=1) {
                // ASDoc Standard: setters get just a @private marker — no @param, no @return
                out.push(["@private"]);
            } else {
                // Most IDEs will use these to help with hover overs/code completion
                out.push([this.settings.tags.keySummary]);
                // In AS3, sSetters can only return "void" so no @return — only one @param for the value argument
                let cleanArgs = fnArgs || "";
                cleanArgs = cleanArgs.replace(/\/\*.*?\*\//, "");
                this.parseArgs(cleanArgs).forEach(arg => {
                    if (arg[0]) {  // skip empty/filler args
                        out.push([
                            "@param",
                            this.formatType(arg[1] || "type"),
                            arg[0],
                            "description"
                        ]);
                    }
                });
            }
            return out;
        }

        // Default: pass through to base parser for functions, constructors, etc.
        return super.createFunctionBlock(fnName, fnType, fnArgs, retType, throwArgs);
    }

    /**
     * Helper to remove metadata from class and variables to parse
     * @param {string} line - The line of text to examine
     */
    stripMetadata(line) {
        return line.replace(/\[[\s\S]*?\]\s*/g, "");
    }

    parseClass(line) {
        line = this.stripMetadata(line);
        // ActionScript has scopes that could be part of the Class declaration.
        const regex = new RegExp(
            "^\\s*" +
            // We're not going to worry about order, since this would make the Regex much more complicated
            "(?:(?:public|private|protected|internal)\\s+)?" +
            "(?:final\\s+)?" +
            "(?:dynamic\\s+)?" +
            "class\\s+" +
            "(?<name>" + this.settings.clsIdentifier + ")" +
            "(?:\\s+extends\\s+(?<extends>" + this.settings.clsIdentifier + "))?"
        );
        const match = regex.exec(line);
        if (!match) {
            return null;
        }

        return [match.groups.name, match.groups.extends];
    }

    parseFunction(line) {
        // line = this.stripMetadata(line);

        const methodRegex = new RegExp(
            "^\\s*" +
            // We're not going to worry about order, since this would make the Regex much more complicated
            "(?:(?:public|private|protected|internal|static|final|override)\\s+)*" +
            "function\\s+" +
            "(?<name2>" + this.settings.fnIdentifier + ")" +
            "\\s*\\((?<args>.*?)\\)" +
            "(?:\\s*:\\s*(?<returnType>[^\\s{]+))?"
        );

        const getterSetterMethodRegex = new RegExp(
            "^\\s*" +
            "(?:(?:public|private|protected|internal|static)\\s+)*" +
            "function\\s+" +
            "(?<getter>get|set)\\s+" +
            "(?<name2>" + this.settings.fnIdentifier + ")" +
            "\\((?<args>.*?)\\)" +
            "(?:\\s*:\\s*(?<returnType>[^\\s{]+))?"
        );

        let methodMatch = null;
        let getterMatch = null;

        const matches = (
            // (functionMatch = functionRegex.exec(line)) ||
            (getterMatch = getterSetterMethodRegex.exec(line)) ||
            (methodMatch = methodRegex.exec(line)) // ||
            // arrowFunctionRegex.exec(line)
        );

        if (matches === null) {
            return null;
        }

        // grab the name out of "name1 = function name2(foo)" preferring name1
        const name = matches.groups.name1 || matches.groups.name2 || "";
        const args = matches.groups.args || matches.groups.arg || null;

        let type = null;
        let returnType = matches.groups.returnType || null;

        if (methodMatch) {
            type = (name === "constructor") ? "constructor" : "member";
        }
        if (getterMatch) {
            type = (matches.groups.getter === "get") ? "getter" : "setter";
        }

        return [name, type, args, returnType];
    }

    parseVar(line) {
        line = this.stripMetadata(line);
        const regex = new RegExp(
                "^\\s*" +
                "(?:(?:public|private|protected|internal|static|final|override)\\s+)*" +
                "(?:final\\s+)?" +
                "(?:var|const)\\s+" +
                "(?<name>" + this.settings.varIdentifier + ")" +
                "(?:\\s*:\\s*(?<type>[^=;\\s]*))?" +
                "(?:\\s*(?=)?\\s*(?<value>.*?))?" +  // Optional assigning value
                "\\s*;?$"
            );

        const match = regex.exec(line);
        if (!match) {
            return null;
        }

        return [match.groups.name, match.groups.type || null, match.groups.value || null];
    }

    parseArg(line) {
        // rest parameter
        let regex = new RegExp(
            "(?<name>" + this.settings.varIdentifier + ")" +
            "\\s*:\\s*" +
            "(?<type>[^=,\)\s]+)" +
            "(?:\\s*=\\s*(?<value>.*))?"
        );

        let match = regex.exec(line);
        if (match) {
            return [match.groups.name, match.groups.type, match.groups.value || null];
        }

        // destructuring assignment
        regex = new RegExp(
            "^(?<object>\\{.*\\})|^(?<array>\\[.*\\])"
        );

        match = regex.exec(line);
        if (match) {
            if (match.groups.object) {
                return ["", "Object", null]; // extract every property here?
            } else if (match.groups.array) {
                return ["", "Array", null];  // extract every param here?
            }
        }

        regex = new RegExp(
            "(?<name>" + this.settings.varIdentifier + ")(\\s*=\\s*(?<value>.*))?"
        );

        match = regex.exec(line);
        if (match) {
            return [match.groups.name, null,  match.groups.value];
        }

        return [line, null, null];
    }

    getDocTags(line) {
        const tags = [
            // Official ASDoc tags
            ["param", "{${0:type}} ${1:name} ${2:description}"],
            ["return", "{${0:type}} ${1:description}"],
            ["throws", "{${0:type}} ${1:description}"],
            ["see", "${0:reference}"],
            ["since", "${0:version}"],
            ["default", "${0:value}"],
            ["private", ""],
            ["internal", ""],
            ["inheritDoc", ""],
            ["copy", "${0:source}"],
            ["eventType", "${0:event}"],
            // Not officially ASDoc, but useful
            ["author", "${0:name} ${1:email}"],
            ["deprecated", "${0:description}"],
            ["example", "${0:example}"],
            ["exampleText", "${0:example}"],
            ["todo", ""],
            ["note", ""],
            ["warning", ""],
            ["version", "${0:version}"]
        ];

        const regex = new RegExp(
            /^\*\s+@(?<tag>.*)/
        );

        const match = regex.exec(line);
        if (!match) {
            return [];
        }

        const matches = [];
        const typed = match.groups.tag;

        tags.forEach(tag => {
            if (tag[0].includes(typed)) {
                matches.push(tag);
            }
        });

        return matches;
    }

}

module.exports = ActionScriptParser;
