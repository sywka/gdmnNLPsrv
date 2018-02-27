import {DBOptions, FBExpress, FBExpressOptions} from "../graphql-bridge";
import NLPSchema from "./NLPSchema";
import NLPFBAdapter from "./adapter/fb/NLPFBAdapter";
import Schema from "../graphql-bridge/Schema";
import FBGraphQLContext from "../graphql-bridge/adapter/fb/FBGraphQLContext";

export default class NLPFBExpress extends FBExpress {

    protected _createSchema(options: FBExpressOptions): Schema<FBGraphQLContext> {
        const schema = new NLPSchema({
            adapter: new NLPFBAdapter({
                ...(options as DBOptions),
                blobLinkCreator: this._createBlobUrl.bind(this),
            })
        });
        schema.createSchema().catch(console.error);
        return schema;
    }
}