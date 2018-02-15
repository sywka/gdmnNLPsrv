import {Router} from "express";

export default abstract class BaseRouter {

    protected constructor() {
        this._router = Router();
        this.routes(this._router);
    }

    private readonly _router: Router;

    get router(): Router {
        return this._router;
    }

    protected abstract routes(router: Router);
}