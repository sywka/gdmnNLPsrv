import {Router} from "express";

export default abstract class BaseRouter {

    constructor() {
        this._router = Router();
        this.routes(this._router);
    }

    private _router: Router;

    get router(): Router {
        return this._router;
    }

    protected abstract routes(router: Router);
}