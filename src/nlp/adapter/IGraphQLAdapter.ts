import {Request} from "express";
import {IGraphQLSchemaAdapter} from "../NLPSchema";
import IGraphQLContext from "./IGraphQLContext";

export default interface IGraphQLAdapter<GraphQLContext extends IGraphQLContext>
    extends IGraphQLSchemaAdapter<GraphQLContext> {

    createContext(request: Request): Promise<GraphQLContext>;
}