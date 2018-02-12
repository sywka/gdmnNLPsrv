import express from "express";
import config from "config";
import graphqlHTTP from "express-graphql";
import {express as expressMiddleware} from "graphql-voyager/middleware";
import {NLPSchema} from "../../graphql/nlp/NLPSchema";
import {FBAdapter} from "../../graphql/nlp/adapter/fb/FBAdapter";
import {Options} from "../../graphql/nlp/adapter/fb/DBManager";
import Context from "../../graphql/nlp/adapter/fb/Context";

const options: Options = {
    host: config.get("db.host"),
    port: config.get("db.port"),
    user: config.get("db.user"),
    password: config.get("db.password"),
    database: config.get("db.path")
};

const nlpSchema = new NLPSchema({
    adapter: new FBAdapter(options)
});
nlpSchema.createSchema().catch(console.error);

const router = express.Router();

router.use("/schema/viewer", (req, res, next) => {
    expressMiddleware({
        endpointUrl: "/api/v1",
        displayOptions: req.query
    })(req, res, next);
});

router.use("/", graphqlHTTP(async (req) => {
    const startTime = Date.now();

    await Context.createPoolIfNotExist(options, 1000);
    const context = await new Context().attachFromPool();

    if (!nlpSchema.schema) throw new Error("Temporarily unavailable");
    return {
        schema: nlpSchema.schema,
        graphiql: true,
        context: context,
        async extensions({document, variables, operationName, result}) {
            await context.detach();
            return {runTime: (Date.now() - startTime) + " мсек"};
        }
    };
}));

export default router;