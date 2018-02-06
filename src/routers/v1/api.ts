import express from "express";
import config from "config";
import graphqlHTTP from "express-graphql";
import {express as expressMiddleware} from "graphql-voyager/middleware";
import {createQueueDBContext, destroyQueueDBContext} from "../../graphql/nlp/adapter/fb/queue";
import {Options} from "../../graphql/nlp/adapter/fb/DBManager";
import {NLPSchema} from "../../graphql/nlp/NLPSchema";
import {FBAdapter} from "../../graphql/nlp/adapter/fb/FBAdapter";

const options: Options = {
    host: config.get("db.host"),
    port: config.get("db.port"),
    user: config.get("db.user"),
    password: config.get("db.password"),
    database: config.get("db.path")
};

const nlpSchema = new NLPSchema({adapter: new FBAdapter(options)});

const router = express.Router();

router.use("/schema/viewer", (req, res, next) => {
    expressMiddleware({
        endpointUrl: "/api/v1",
        displayOptions: req.query
    })(req, res, next);
});

router.use("/", graphqlHTTP(async (req) => {
    const startTime = Date.now();
    let context = await createQueueDBContext(options);
    return {
        schema: await nlpSchema.getSchema(),
        graphiql: true,
        context: context,
        async extensions({document, variables, operationName, result}) {
            await destroyQueueDBContext(context);
            return {runTime: (Date.now() - startTime) + " мсек"};
        }
    };
}));

export default router;