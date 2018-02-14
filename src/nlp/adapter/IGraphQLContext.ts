export default interface IGraphQLContext {
    attach(): Promise<IGraphQLContext>;

    detach(): Promise<any>;
}