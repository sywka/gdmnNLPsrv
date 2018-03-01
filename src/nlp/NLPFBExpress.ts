import {DBOptions, FBExpress, FBExpressOptions, FBGraphQLContext, Schema} from "graphql-sql-bridge";
import NLPSchema from "./NLPSchema";
import NLPFBAdapter from "./adapter/fb/NLPFBAdapter";

export default class NLPFBExpress extends FBExpress {

    protected _getSchema(options: FBExpressOptions): Schema<FBGraphQLContext> {
        return new NLPSchema({
            adapter: new NLPFBAdapter({
                ...(options as DBOptions),
                blobLinkCreator: this._createBlobUrl.bind(this),
            })
        });
    }
}