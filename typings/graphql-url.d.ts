declare module "graphql-url" {

    import {GraphQLScalarType} from "graphql";

    export const GraphQLUrl: GraphQLScalarType;
    export const GraphQLRelativeUrl: GraphQLScalarType;
    export const GraphQLAbsoluteUrl: GraphQLScalarType;
}