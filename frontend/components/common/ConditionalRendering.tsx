import { ReactNode, Children, isValidElement } from 'react';

type ConditionalProps = {
    children: ReactNode;
};

type IfProps = {
    condition: boolean;
    children: ReactNode;
};

type ElseIfProps = {
    condition: boolean;
    children: ReactNode;
};

type ElseProps = {
    children: ReactNode;
};

const If = ({ condition, children }: IfProps): ReactNode => {
    return condition ? <>{children}</> : null;
};

const ElseIf = ({ condition, children }: ElseIfProps): ReactNode => {
    return condition ? <>{children}</> : null;
};

const Else = ({ children }: ElseProps): ReactNode => {
    return <>{children}</>;
};

const ConditionalRendering = ({ children }: ConditionalProps): ReactNode => {
    let conditionMet = false;
    let result: ReactNode = null;

    Children.forEach(children, (child) => {
        if (!isValidElement(child) || conditionMet) return;

        const childType = child.type;

        if (childType === If || childType === ElseIf) {
            const condition = (child.props as IfProps | ElseIfProps).condition;
            if (condition) {
                conditionMet = true;
                result = (child.props as IfProps | ElseIfProps).children;
            }
        } else if (childType === Else && !conditionMet) {
            result = (child.props as ElseProps).children;
            conditionMet = true;
        }
    });

    return result as ReactNode;
};

ConditionalRendering.If = If;
ConditionalRendering.ElseIf = ElseIf;
ConditionalRendering.Else = Else;

export { If, ElseIf, Else };
export default ConditionalRendering;
