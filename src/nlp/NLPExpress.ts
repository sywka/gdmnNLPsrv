import {Handler, Request} from "express";
import graphqlHTTP from "express-graphql";
import {NLPSchema} from "./NLPSchema";
import IGraphQLContext from "./adapter/IGraphQLContext";
import IGraphQLAdapter from "./adapter/IGraphQLAdapter";

export interface NLPOptions<GraphQLContext extends IGraphQLContext> {
    adapter: IGraphQLAdapter<GraphQLContext>;
    graphiql?: boolean;
}

export default class NLPExpress<GraphQLContext extends IGraphQLContext> {

    private _nlpSchema: NLPSchema<GraphQLContext>;
    private _adapter: IGraphQLAdapter<GraphQLContext>;
    private _graphiql: boolean;

    constructor(options: NLPOptions<GraphQLContext>) {
        this._adapter = options.adapter;
        this._graphiql = options.graphiql;
        this._nlpSchema = new NLPSchema({
            adapter: options.adapter
        });
        this._nlpSchema.createSchema().catch(console.error);
    }

    get middleware(): Handler {
        return graphqlHTTP(async (req: Request) => {
            const startTime = Date.now();

            const context = await this._adapter.createContext(req);
            await context.attach();

            if (!this._nlpSchema.schema) throw new Error("Temporarily unavailable");
            return {
                schema: this._nlpSchema.schema,
                graphiql: this._graphiql,
                context: context,
                async extensions({document, variables, operationName, result}) {
                    await context.detach();
                    return {runTime: (Date.now() - startTime) + " мсек"};
                }
            };
        });
    }
}