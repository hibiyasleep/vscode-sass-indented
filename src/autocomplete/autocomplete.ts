/*
  The core functionality of the autocomplete is work done by Stanislav Sysoev (@d4rkr00t)
  in his stylus extension and been adjusted to account for the slight differences between
  the languages.

  Original stylus version: https://github.com/d4rkr00t/language-stylus
*/
import {
  CancellationToken,
  CompletionItem,
  CompletionItemProvider,
  Position,
  Range,
  TextDocument,
  workspace,
  ExtensionContext,
  SnippetString,
  extensions,
  commands
} from 'vscode';

import * as cssSchema from './schemas/autocomplete.cssSchema';
import sassSchema from './schemas/autocomplete.schema';

import * as path from 'path';
import { STATE } from '../extension';
import { sassAt } from './schemas/autocomplete.at';
import { sassPseudo } from './schemas/autocomplete.pseudo';
import { isNumber } from 'util';
import { AutocompleteUtilities as Utility } from './autocomplete.utility';
import { Scanner } from './scan/autocomplete.scan';
import { sassCommentCompletions } from './schemas/autocomplete.commentCompletions';
import { isPath } from '../utility/utility.regex';

class SassCompletion implements CompletionItemProvider {
  context: ExtensionContext;
  scan: Scanner;
  constructor(context: ExtensionContext) {
    this.context = context;
    this.scan = new Scanner(context);
  }
  provideCompletionItems(document: TextDocument, position: Position, token: CancellationToken): CompletionItem[] {
    const start = new Position(position.line, 0);
    const range = new Range(start, position);
    const currentWord = document.getText(range).trim();
    const currentWordUT = document.getText(range);
    const text = document.getText();
    const isValue = Utility.isValue(cssSchema, currentWord);
    const config = workspace.getConfiguration();
    const disableUnitCompletion: boolean = config.get('sass.disableUnitCompletion');
    let block = false;
    let isInMixinBlock: CompletionItem[] | false = false;
    let atRules = [];
    let Units = [],
      properties = [],
      values = [],
      classesAndIds = [],
      functions = [],
      variables: CompletionItem[] = [];

    let completions: CompletionItem[] = [];

    if (document.languageId === 'vue') {
      block = Utility.isInVueStyleBlock(start, document);
    }

    if (!block && extensions.getExtension('syler.sass-next') !== undefined && currentWord.startsWith('?')) {
      console.log('a');
      commands.executeCommand('sass.abbreviations').then(() => '', err => console.log('[Sass Abbreviations Error]: ', err));
    }

    if (!block && /^@import/.test(currentWord)) {
      completions = Utility.getImportSuggestionsForCurrentWord(document, currentWord);
      block = true;
    }

    if (!block && currentWord.startsWith('&')) {
      completions = sassPseudo(config.get('sass.andStared'));
      block = true;
    }

    if (!block && !disableUnitCompletion && isNumber(currentWordUT)) {
      Units = Utility.getUnits(currentWord);
    }

    if (!block && currentWord.startsWith('/')) {
      completions = sassCommentCompletions();
      block = true;
    }
    if (!block && isPath(currentWord)) {
      block = true;
    }

    if (!block) {
      let imports = Utility.getImports(text);
      // also get current file from the workspace State.
      imports.push(path.basename(document.fileName));
      isInMixinBlock = Utility.isInMixinBlock(start, document);
      this.scan.scanFile(document);

      if (isValue) {
        values = Utility.getValues(cssSchema, currentWord);
        if (isInMixinBlock === false) {
          imports.forEach(item => {
            const state: STATE = this.context.workspaceState.get(path.normalize(path.join(document.fileName, '../', item)));
            if (state) {
              for (const key in state) {
                if (state.hasOwnProperty(key)) {
                  const element = state[key];
                  if (element.type === 'Variable') {
                    const completionItem = new CompletionItem(element.item.title);
                    completionItem.insertText = element.item.insert;
                    completionItem.detail = element.item.detail;
                    completionItem.kind = element.item.kind;
                    variables.push(completionItem);
                  }
                }
              }
            }
          });
        } else {
          variables = isInMixinBlock;
        }

        functions = sassSchema;
      } else {
        variables = [];

        imports.forEach(item => {
          const state: STATE = this.context.workspaceState.get(path.normalize(path.join(document.fileName, '../', item)));
          if (state) {
            for (const key in state) {
              if (state.hasOwnProperty(key)) {
                const element = state[key];
                if (element.type === 'Mixin') {
                  const completionItem = new CompletionItem(element.item.title);
                  completionItem.insertText = new SnippetString(element.item.insert);
                  completionItem.detail = element.item.detail;
                  completionItem.kind = element.item.kind;
                  variables.push(completionItem);
                }
              }
            }
          }
        });

        classesAndIds = Utility.getHtmlClassOrIdCompletions(document);
        atRules = sassAt;
        properties = Utility.getProperties(cssSchema, currentWord);
      }

      completions = [].concat(properties, values, functions, Units, variables, atRules, classesAndIds);
    }

    return completions;
  }
}

export default SassCompletion;
