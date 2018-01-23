import * as express from 'express'
import * as graphqlHTTP from 'express-graphql'
import { express as expressMiddleware } from 'graphql-voyager/middleware'
import { createQueueDBContext, destroyQueueDBContext } from '../../graphql/v1/queue'
import {NLPSchema} from '../../graphql/NLPSchema'
import {FBAdapter} from '../../database/FBAdapter'

let nlpSchema = new NLPSchema({
    adapter: new FBAdapter(),
    emulatedLinkCoder: (table, field, ref) => `LINK_${ref.id}`,
    emulatedEntityCoder: (table, field, ref) => `EMULATED_${table.name}_${ref.id}`
});

const router = express.Router();

router.use('/schema/viewer', (req, res, next) => {
    expressMiddleware({
        endpointUrl: '/api/v1',
        displayOptions: req.query
    })(req, res, next)
});

router.use('/', graphqlHTTP(async (req) => {
    const startTime = Date.now()
    let context = await createQueueDBContext()
    return {
        schema: await nlpSchema.getSchema(),
        graphiql: true,
        context: context,
        async extensions ({document, variables, operationName, result}) {
            await destroyQueueDBContext(context)
            return {runTime: (Date.now() - startTime) + ' мсек'}
        }
    }
}));

export default router