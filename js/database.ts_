

interface Location {
	file: string;
	line: number;
}


interface Expression {

}

type AssertionPriority = 'prefer' | 'ensure';
type AssertionRelation = '==' | '<' | '>' | '>=' | '<=' | '!=';

interface SimpleAssertion {
	type: 'simple';
	priority: AssertionPriority;
	dependsOn: Expression;
	config: string;
	relation: AssertionRelation;
	value: Expression;
	message?: string;
  location: Location;
}

interface ComplexAssertion {
	type: 'complex';
	priority: AssertionPriority;
	dependsOn: Expression;
	condition: Expression;
	message?: string;
  location: Location;
}

type Assertion = ComplexAssertion | SimpleAssertion;

interface ConfigOption {
	name: string;
	location: Location[];
	brief: string;
	description: string;
	visible: boolean;
	type: any; // what kind of types
	dependsOn: Expression;
	defaultValues: { dependsOn: Expression, value: Expression, location: Location }[];
	simpleAssertions: SimpleAssertion[];
	setValues: { dependsOn: Expression, value: Expression, location: Location }[];
}

