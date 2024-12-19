// @ts-check

/**
 * @param {import('estree').Expression | import('estree').Super | null | undefined} tag
 * @returns  {tag is import('estree').CallExpression}
 */
const isCallExpression = (tag) => tag?.type === 'CallExpression';
/**
 * @param {import('estree').Node} node
 * @returns  {node is import('estree').ReturnStatement}
 */
const isReturnStatement = (node) => node.type === 'ReturnStatement';
/**
 * @param {import('estree').Expression} tag
 * @returns {tag is import('estree').CallExpression}
 */
const isStyledFunc = (tag) => isCallExpression(tag) && isIdentifier(tag.callee) && tag.callee?.name === 'styled';
/**
 * @param {import('estree').TaggedTemplateExpression} node
 */
const getStyledFuncComponentArgument = (node) =>
  isStyledFunc(node.tag) && node.tag.arguments?.[0]?.type === 'Identifier' ? node.tag.arguments[0] : null;
/**
 * @param {import('estree').TaggedTemplateExpression} node
 */
const getStyledFuncStringArgument = (node) =>
  isStyledFunc(node.tag) && node.tag.arguments?.[0]?.type === 'Literal' ? node.tag.arguments[0] : null;
/**
 * @param {import('estree').Expression} tag
 */
const getStyledFuncWithAttrs = (tag) =>
  isCallExpression(tag) &&
  tag.callee.type === 'MemberExpression' &&
  isCallExpression(tag.callee.object) &&
  isStyledIdentifier(tag.callee.object.callee) &&
  isAttrs(tag)
    ? tag.callee
    : null;

/**
 * @param {import('estree').TaggedTemplateExpression} node
 */
const getStyledStringArgumentFuncWithAttrs = (node) => {
  const callee = getStyledFuncWithAttrs(node.tag);

  return isCallExpression(callee?.object) && callee.object.arguments[0]?.type === 'Literal'
    ? callee?.object?.arguments[0]
    : null;
};

/**
 * @param {import('estree').TaggedTemplateExpression} node
 */
const getStyledComponentArgumentFuncWithAttrs = (node) => {
  const callee = getStyledFuncWithAttrs(node.tag);

  return isCallExpression(callee?.object) && isIdentifier(callee.object.arguments[0])
    ? callee.object.arguments[0]
    : null;
};
/**
 * @param {import('estree').TaggedTemplateExpression} node
 */
const getStyledCallElementObjectMapArgumentTag = (node) =>
  isCallExpression(node.tag) &&
  node.tag.arguments?.[0]?.type === 'MemberExpression' &&
  isIdentifier(node.tag.arguments?.[0]?.property) &&
  node.tag.arguments?.[0]?.property?.name
    ? node.tag.arguments[0].property.name
    : null;
/**
 *
 * @param {import('estree').Node | null | undefined} node
 * @returns  {node is import('estree').Identifier}
 */
const isIdentifier = (node) => node?.type === 'Identifier';
/**
 *
 * @param {import('estree').Node | null | undefined} node
 * @returns  {node is import('estree').Identifier}
 */
const isStyledIdentifier = (node) => isIdentifier(node) && node.name === 'styled';
/**
 *
 * @param {import('estree').Expression} tag
 */
const isAttrs = (tag) =>
  isCallExpression(tag) &&
  'property' in tag.callee &&
  isIdentifier(tag.callee.property) &&
  tag.callee.property.name === 'attrs';

const getAttrsType = (node) => {
  const type = node.tag?.arguments?.[0]?.type;
  return type === 'FunctionExpression'
    ? 'func'
    : type === 'ArrowFunctionExpression'
    ? 'arrow'
    : type === 'ObjectExpression'
    ? 'object'
    : '';
};
const { inspect } = require('util');
const { __UNKNOWN_IDENTIFER__ } = require('./constants');

/**
 *
 * @param {Record<string, {name: string; attrs: any[]; tag: string}>} styledComponentsDict
 * @param {import('eslint').Rule.RuleContext} context
 * @param {string} name
 * @returns {import('eslint').Rule.RuleListener}
 */
module.exports = (styledComponentsDict, context, name) => {
  /**
   * enable checking custom components
   * @see https://github.com/jsx-eslint/eslint-plugin-jsx-a11y#usage
   */
  const componentMap = context.settings?.['jsx-a11y']?.components ?? {};

  return {
    CallExpression: function CallExpression(node) {
      try {
        // TODO: Consider supporting more complex parent name definitions (e.g. object keys)
        let styledComponentName =
          node.parent && node.parent.type === 'VariableDeclarator' && isIdentifier(node.parent.id)
            ? node.parent.id.name
            : null;
        if (!styledComponentName) {
          // const Components = { Component: styled.div({ ... }) }
          if (
            node.parent.type === 'Property' &&
            isIdentifier(node.parent.key) &&
            node.parent.key.name &&
            node.parent.parent?.parent?.type === 'VariableDeclarator' &&
            isIdentifier(node.parent.parent.parent.id) &&
            node.parent.parent.parent.id.name
          ) {
            styledComponentName = `${node.parent.parent.parent.id.name}.${node.parent.key.name}`;
          } else {
            return;
          }
        }

        let tag = '';

        if (!styledComponentName) return;

        // styled.?({ ... })
        if (node.callee?.type === 'MemberExpression' && isStyledIdentifier(node.callee.object)) {
          // styled.div({ ... })
          if (node.callee.property?.type === 'Identifier' && node.callee.property.name) {
            tag = node.callee.property.name;

            if (!tag) return;

            styledComponentsDict[styledComponentName] = {
              name: styledComponentName,
              attrs: [],
              tag: tag,
            };
          }
        }

        // styled(...)(...)
        if (node.callee?.type === 'CallExpression' && isStyledIdentifier(node.callee.callee)) {
          let arg = node.callee.arguments[0];

          if (!arg) return;

          // styled('div')(...)
          if (arg.type === 'Literal') {
            tag = String(arg.value);

            if (!tag) return;

            styledComponentsDict[styledComponentName] = {
              name: styledComponentName,
              attrs: [],
              tag: tag,
            };
          }

          // TODO: Consider supporting templates like styled(`div`)(...)
          if (arg.type !== 'Identifier') return;

          // styled(StyledComponent)({ ... })

          let attrs = [];
          let ancestorScName = arg.name;

          if (styledComponentsDict[ancestorScName]) {
            // Add attrs if the ancestor has them
            attrs = styledComponentsDict[ancestorScName].attrs;
            tag = styledComponentsDict[ancestorScName].tag;
          }

          // styled(CustomComponent)({ ...})
          if (componentMap[ancestorScName]) {
            tag = componentMap[ancestorScName];
          }

          if (!tag) return;

          styledComponentsDict[styledComponentName] = {
            name: styledComponentName,
            attrs: attrs,
            tag: tag,
          };
        }
      } catch (error) {
        context.report({
          message: 'Unable to parse styled component: {{ message }}',
          node,
          data: { message: error.message, stack: error.stack },
        });
      }
    },
    TaggedTemplateExpression(node) {
      // const func = (inspectee) =>
      //   name.includes('html-has-lang') && context.report({node,message: `made it here: ${inspect(inspectee || node)}`});

      let scName =
        node.parent.type === 'VariableDeclarator' &&
        node.parent.id &&
        isIdentifier(node.parent.id) &&
        node.parent.id.name;

      if (!scName) {
        // const Components = { Component: styled.div`` }
        if (
          node.tag.type === 'MemberExpression' &&
          isStyledIdentifier(node.tag?.object) &&
          node.parent.type === 'Property' &&
          isIdentifier(node.parent.key) &&
          node.parent.key.name &&
          node.parent.parent?.parent?.type === 'VariableDeclarator' &&
          isIdentifier(node.parent.parent.parent.id) &&
          node.parent.parent.parent.id.name
        ) {
          scName = `${node.parent.parent.parent.id.name}.${node.parent.key.name}`;
        } else {
          return;
        }
      }

      let attrs = [];
      let tag = '';

      // styled(Component)`` || styled.div.attrs(...)`` || styled('div')``
      if (isCallExpression(node.tag)) {
        // styled(animated.div)``
        tag = getStyledCallElementObjectMapArgumentTag(node) || '';

        // styled('div')``;
        if (!tag) {
          const stringArg = getStyledFuncStringArgument(node);
          if (stringArg?.value) {
            tag = String(stringArg.value);
          }
        }

        // styled(Component)`` || styled(Component).attrs(...)``
        const componentArg = getStyledFuncComponentArgument(node) || getStyledComponentArgumentFuncWithAttrs(node);
        if (componentArg) {
          const ancestorScName = componentArg.name;

          // styled(StyledComponent)`` || styled(StyledComponent).attrs(...)``
          if (styledComponentsDict[ancestorScName]) {
            ({ attrs } = styledComponentsDict[ancestorScName]);
            ({ tag } = styledComponentsDict[ancestorScName]);
          }

          // styled(CustomComponent)`` || styled(CustomComponent).attrs(...)``
          if (componentMap[ancestorScName]) {
            tag = componentMap[ancestorScName];
          }
        }

        // styled.div.attrs(...)`` || styled('div').attrs(...)``
        if (isAttrs(node.tag) || getStyledFuncWithAttrs(node.tag)) {
          const arg = getStyledStringArgumentFuncWithAttrs(node);
          if (arg) {
            // styled('div').attrs(...)``
            tag = String(arg.value);
          } else if (
            node.tag.callee.type === 'MemberExpression' &&
            node.tag.callee.object.type === 'MemberExpression' &&
            isIdentifier(node.tag.callee.object.property)
          ) {
            // styled.div.attrs(...)``
            tag = node.tag.callee.object.property.name;
          }

          if (!tag) return;

          const attrsNode = node.tag.arguments[0];

          if (!attrsNode) return;

          // styled.div.attrs(function() { return {} })``

          let attrsPropertiesArr = [];
          // TODO all these empty array defaults are a temp fix. Should get a better way of actually trying to see what
          //  is returned from function attrs in the case they aren't just simple immediate returns, e.g., if else statements
          if (attrsNode.type == 'ArrowFunctionExpression' && attrsNode.body?.type === 'ObjectExpression') {
            attrsPropertiesArr = attrsNode.body.properties;
            // styled.div.attrs(() => ({}))``
          } else if (attrsNode.type == 'FunctionExpression') {
            const returnStatement = attrsNode.body?.body?.find(isReturnStatement);

            if (returnStatement?.argument?.type === 'ObjectExpression') {
              attrsPropertiesArr = returnStatement.argument.properties;
            }
            // styled.div.attrs({})``
          } else if (attrsNode.type === 'ObjectExpression') {
            attrsPropertiesArr = attrsNode.properties;
          }

          const arithmeticUnaryOperators = ['+', '-'];
          // filter out spread elements (which have no key nor value)
          attrs = attrs.concat(
            attrsPropertiesArr
              .filter((x) => x.key)
              .map((x) => ({
                key: x.key.name || x.key.value,
                // this is pretty useless. would need to generate code from any template expression for this to really work
                value:
                  x.value.type === 'TemplateLiteral'
                    ? // need to grab falsy vals like empty strings, thus the x ? x : identifier instead of x|| identifier
                      typeof x.value.quasis[0].value.raw === 'undefined'
                      ? __UNKNOWN_IDENTIFER__
                      : x.value.quasis[0].value.raw
                    : x.value.type === 'UnaryExpression' && arithmeticUnaryOperators.includes(x.value.operator)
                    ? // if simple arithemetic, concat the symbol and the strings (like a negative) and then coerce to a number
                      +(x.value.operator + x.value.argument.value)
                    : x.value.type === 'Identifier'
                    ? x.value.name === 'undefined'
                      ? undefined
                      : __UNKNOWN_IDENTIFER__
                    : typeof x.value.value === 'undefined'
                    ? // if property exists, but no value found, just set it to our unknown identifier so it returns truthy and not something specific like a number or boolean or undefined as these are tested in specific ways for different linting rules
                      // too many options for what this could be, but this can approxinate what is needed for linting
                      // need to grab falsy vals like empty strings, thus the x ? x : identifier instead of x|| identifier
                      __UNKNOWN_IDENTIFER__
                    : x.value.value,
              })),
          );
        }

        styledComponentsDict[scName] = { name: scName, attrs, tag };
      }

      // const A = styled.div``
      if (node.tag.type === 'MemberExpression' && isStyledIdentifier(node.tag?.object)) {
        tag = 'name' in node.tag.property ? node.tag.property.name : '';

        if (!tag) return;

        styledComponentsDict[scName] = {
          name: scName,
          tag,
          attrs,
        };
      }
    },
  };
};
