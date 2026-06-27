const LanguageParser = require("parser.js");

/**
 * CSharp Parser
 * @extends LanguageParser
 */

class CSharpParser extends LanguageParser {

    constructor() {
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
        const settings = {
            language: "csharp",
            varIdentifier: "@?[A-Za-z_][A-Za-z0-9_]*",
            fnIdentifier: "[A-Za-z_][A-Za-z0-9_]*",
            clsIdentifier: "[A-Z_][A-Za-z0-9]*",
            typeInfo: "%s",
            tags: {
                keySummary: "summary",
                keyVar: "param",
                keyRet: "@returns"
            },
            commentStyle: "///"
        };
        super(settings);
    }

    /**
     * Helper to remove content after opening brace { or arrow =>
     * @param {string} line - The line of text to examine
     */
    trimToBracketOrArrow(line) {
        return line.split("{", 1)[0].split("=>", 1)[0].trim();
    }

    parseClass(line) {
        const regex = new RegExp(
            "^\\s*" +
            "(?:(?:public|private|protected|internal)\\s+)?" +
            "(?:(?:abstract|sealed|static|partial)\\s+)*" +
            "(?:class|struct|interface|record|enum)\\s+" +
            "(?<name>" + this.settings.clsIdentifier + ")"
        );

        const match = regex.exec(line);
        if (!match) {
            return null;
        }

        return [match.groups.name, ""];
    }

    parseFunction(line) {
        line = this.trimToBracketOrArrow(line);
        const regex = new RegExp(
            "^\\s*" +
            "(?:(?:public|private|protected|internal|static|virtual|override|abstract|sealed|async|extern|unsafe|new|partial)\\s+)*" +
            "(?<returnType>[A-Za-z0-9_<>,?.\\[\\]]+)\\s+" +
            "(?<name>" + this.settings.fnIdentifier + ")" +
            "(?:<[^>]+>)?" +
            "\\s*\\((?<args>[^)]*)\\)"
        );

        const matches = regex.exec(line);
        if(!matches || !matches.groups.name) {
            return null;
        }

        return [
            matches.groups.name,
            null,
            matches.groups.args.trim(),
            matches.groups.returnType.trim()
        ];
    }

    parseVar(line) {
        line = this.trimToBracketOrArrow(line);
        const regex = new RegExp(
            "^\\s*" +
            "(?:(?:public|private|protected|internal|static|readonly|const|volatile|new)\\s+)*" +
            "(?<type>[^\\s=(]+)\\s+" +
            "(?<name>" + this.settings.varIdentifier + ")"
         );

        const matches = regex.exec(line);
        if(!matches || !matches.groups.name) {
            return null;
        }

        return [matches.groups.name, null, null];
    }

    parseArg(line) {
        // Remove default value
        line = line.replace(/\s*=.*$/, "").trim();
        // Remove parameter attributes
        line = line.replace(/^\s*(?:\[[^\]]+\]\s*)*/, "");

        const parts = line.split(/\s+/);
        const name = parts.pop();

        const modifiers = new Set([
            "ref",
            "out",
            "in",
            "params",
            "this",
            "scoped"
        ]);

        const type = parts.filter(p => !modifiers.has(p)).join(" ");

        return [
            name,
            type,
            null
        ];
    }

    // C Sharp uses XML docs

    formatDocBlock(docBlock) {
        const out = [];

        let tabStop = 0;

        out.push("/// <summary>");
        out.push("/// " + this.formatPlaceholder("summary", tabStop));
        out.push("/// </summary>");

        const paramList = docBlock.filter(entry => {
            return entry[0] === "@param";
        });

        const returnList = docBlock.filter(entry => {
            return entry[0] === "@returns";
        });

        if (paramList.length) {
            paramList.forEach(entry => {
                tabStop++;
            	out.push('/// <param name="' + entry[2] + '">' + this.formatPlaceholder("description", tabStop) + "</param>");
            });
        }

        if (returnList.length) {
            if(returnList[0][1] !== "void") { // Don't add return if it's type is `void`
                tabStop++;
                out.push("/// <returns>" + this.formatPlaceholder("description", tabStop) + "</returns>");
            }
        }

        return out;
    }

    formatHeaderBlock(docBlock) {
        // Since the header will be similar to the DocBlock, just do that
        return this.formatDocBlock(docBlock);
    }

    getDocTags(line) {
        const eol = nova.workspace.activeTextEditor.document.eol;
        // Gathered from https://learn.microsoft.com/en-us/dotnet/csharp/language-reference/language-specification/documentation-comments
        // in CompletionProvider.provideTags(), if the tag match[1] ends with `/>`, it won't add a closing tag!
        const tags = [
            ["c", ">${0:text}"],
            ["code", ">${0}"],
            ["example", ">${0:description}"],
            ["exception", " cref=\"${0:member}\">${1:description}"],
            ["include", " file=\"${0:filename}\" path=\"${1:xpath}\" />"],
            ["list", ">${0}"],
            ["listheader", ">${0}"],
            ["item", ">${0}"],
            ["term", ">${0}"],
            ["description", ">${0}"],
            ["para", ">${0:content}"],
            ["param", " name=\"${0:name}\">${1:description}"],
            ["paramref", " name=\"${0:name}\" />"],
            ["permission", " cref=\"${0:member}\">${1:permission}"],
            ["remarks", ">${0:description}"],
            ["returns", ">${0:description}"],
            ["see", " cref=\"${0:member}\"> href=\"${1:url}\" langword=\"${2:keyword}\" />"],
            ["seealso", "  cref=\"${0:member}\"> href=\"${1:url}\" />"],
            ["summary", ">${0:description}"],
            ["typeparam", " name=\"${0:name}\">${1:description}"],
            ["typeparamref", " name=\"${0:name}\" />"],
            ["value", ">${0:property description}"],
        ];

        const regex = new RegExp(
            /^\/{3}\s*<(?<tag>[^\s>]*)/
        );

        const match = regex.exec(line);
        if (!match) {
            return [];
        }

        const matches = [];
        const typed = match.groups.tag.toLowerCase();

        tags.forEach(tag => {
            if (tag[0].includes(typed)) {
                matches.push(tag);
            }
        });

        return matches;
    }
}

module.exports = CSharpParser;
