import {Router} from "express";
import {CodeError, ErrorCode, HttpError, ResponseType} from "../middlewares/errorMiddleware";
import {BaseRouter} from "../graphql-bridge";
import ApiV1 from "./v1/ApiV1";

export default class Api extends BaseRouter<void> {

    protected routes(router: Router) {
        router.use("/v1", new ApiV1().router);

        router.use("/*", (req, res, next) => {
            const error = new HttpError(ResponseType.JSON, 501, new CodeError(ErrorCode.NOT_FOUND_ERROR_CODE,
                "Not implemented yet"));
            next(error);
        });
    }
}