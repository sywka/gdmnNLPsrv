import {Router} from "express";

export default abstract class BaseRouter<Options> {

    private readonly _options: Options;
    private readonly _router: Router;

    protected constructor(options?: Options) {
        this._options = options;
        this._router = Router();
        this.routes(this._router, this._options);
    }

    get router(): Router {
        return this._router;
    }

    protected abstract routes(router: Router, options: Options);
}