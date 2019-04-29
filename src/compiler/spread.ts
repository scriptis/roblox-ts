import * as ts from "ts-morph";
import { checkNonAny, compileCallExpression, compileExpression } from ".";
import { CompilerState } from "../CompilerState";
import { CompilerError, CompilerErrorType } from "../errors/CompilerError";
import {
	isArrayType,
	isIterableIterator,
	isMapType,
	isSetType,
	isStringType,
	isTupleReturnTypeCall,
} from "../typeUtilities";

export function shouldCompileAsSpreadableList(elements: Array<ts.Expression>) {
	let foundSpread = false;
	for (const element of elements) {
		if (foundSpread) {
			return true;
		}
		if (ts.TypeGuards.isSpreadElement(element)) {
			foundSpread = true;
		}
	}
	return false;
}

export function compileSpreadableList(state: CompilerState, elements: Array<ts.Expression>) {
	let isInArray = false;
	const parts = new Array<Array<string> | string>();
	for (const element of elements) {
		if (ts.TypeGuards.isSpreadElement(element)) {
			parts.push(compileArrayForSpreadOrThrow(state, element.getExpression()));
			isInArray = false;
		} else {
			let last: Array<string>;
			if (isInArray) {
				last = parts[parts.length - 1] as Array<string>;
			} else {
				last = new Array<string>();
				parts.push(last);
			}
			last.push(compileExpression(state, element));
			isInArray = true;
		}
	}
	state.usesTSLibrary = true;
	const params = parts.map(v => (typeof v === "string" ? v : `{ ${v.join(", ")} }`)).join(", ");
	return `TS.array_concat(${params})`;
}

export function compileArrayForSpread(state: CompilerState, expression: ts.Expression) {
	const expType = expression.getType();
	if (isSetType(expType)) {
		state.usesTSLibrary = true;
		return `TS.set_values(${compileExpression(state, expression)})`;
	} else if (isMapType(expType)) {
		state.usesTSLibrary = true;
		return `TS.map_entries(${compileExpression(state, expression)})`;
	} else if (isArrayType(expType)) {
		return compileExpression(state, expression);
	} else if (isStringType(expType)) {
		return `string.split(${compileExpression(state, expression)}, "")`;
	} else if (isIterableIterator(expType, expression)) {
		state.usesTSLibrary = true;
		return `TS.iterable_cache(${compileExpression(state, expression)})`;
	}
}

export function compileArrayForSpreadOrThrow(state: CompilerState, expression: ts.Expression) {
	const result = compileArrayForSpread(state, expression);
	if (result) {
		return result;
	} else {
		throw new CompilerError(
			`Unable to spread expression of type ${expression.getType().getText()}`,
			expression,
			CompilerErrorType.BadSpreadType,
		);
	}
}

export function compileSpreadElement(state: CompilerState, node: ts.SpreadElement) {
	const expression = node.getExpression();
	checkNonAny(expression, true);

	if (ts.TypeGuards.isCallExpression(expression) && isTupleReturnTypeCall(expression)) {
		return compileCallExpression(state, expression, true);
	} else {
		return `unpack(${compileArrayForSpreadOrThrow(state, expression)})`;
	}
}
