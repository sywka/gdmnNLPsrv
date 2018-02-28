import NestHydrationJS from "nesthydrationjs";
import {FBDatabase, FBAdapter} from "graphql-sql-bridge";
import {INLPField, INLPTable} from "../../NLPSchema";

export interface IIndex {
    readonly key: string;
}

export interface IBaseIndexing {
    readonly id: string;
    readonly name?: string;
    readonly indices: IIndex[];
}

export interface IFBTable extends IBaseIndexing {
    fields: IFBField[];
}

export interface IFBField extends IBaseIndexing {
    refs: IBaseIndexing[];
}

export default class NLPFBAdapter extends FBAdapter {

    protected static async _getNLPTables(database: FBDatabase): Promise<IFBTable[]> {
        const result: any[] = await database.query(`
          SELECT
            TRIM(tables.usr$relation_name)                              AS "tableName",
            TRIM(tables.usr$relation_name) 
              || '_' || TRIM(fields.usr$field_name)                     AS "fieldKey",
            
            TRIM(REPLACE(entities.usr$name,  ',', ''))                  AS "tableIndexName",
            TRIM(REPLACE(attr.usr$name,  ',', ''))                      AS "fieldIndexName",
            ref_type.id                                                 AS "refKey",
            ref_type.usr$description                                    AS "refDescription",
            TRIM(REPLACE(ref_type_detail.usr$name,  ',', ''))           AS "refTypeIndexName"
                
          FROM usr$nlp_table tables
          
            LEFT JOIN usr$nlp_tentities entities
              ON entities.usr$table_key = tables.id
              AND TRIM(REPLACE(entities.usr$name,  ',', '')) > ''
            LEFT JOIN usr$nlp_field fields
              ON fields.usr$table_key = tables.id
              LEFT JOIN usr$nlp_tentities_attr attr
                ON attr.usr$field_key = fields.id
                AND TRIM(REPLACE(attr.usr$name,  ',', '')) > ''
              LEFT JOIN usr$nlp_field_ref field_ref ON field_ref.USR$FIELD_KEY = fields.ID
                LEFT JOIN usr$nlp_ref_type ref_type ON ref_type.id = field_ref.usr$ref_type_key
                  LEFT JOIN usr$nlp_ref_type_detail ref_type_detail
                    ON ref_type_detail.usr$ref_type_key = ref_type.id
                    AND TRIM(REPLACE(ref_type_detail.usr$name,  ',', '')) > ''
        `);

        const definition: any = [{
            id: {column: "tableName", id: true},
            indices: [{
                key: "tableIndexName"
            }],
            fields: [{
                id: {column: "fieldKey", id: true},
                indices: [{
                    key: "fieldIndexName"
                }],
                refs: [{
                    id: {column: "refKey", type: "NUMBER"},
                    name: "refDescription",
                    indices: [{
                        key: "refTypeIndexName"
                    }]
                }]
            }]
        }];

        return NestHydrationJS().nest(result, definition);
    }

    private static _createDescription(indices: IIndex[], name?: string): string {
        const description = name ? name : "";
        if (!indices) return description;

        return indices.reduce((strOfIndices, index) => {
            if (strOfIndices) strOfIndices += ",";
            strOfIndices += index.key;
            return strOfIndices;
        }, description);
    }

    protected async _queryToDatabase(database: FBDatabase): Promise<INLPTable[]> {
        const tables = await super._queryToDatabase(database) as INLPTable[];

        try {
            const nlpTables = await NLPFBAdapter._getNLPTables(database);

            nlpTables.forEach((nlpTable) => {
                const table = tables.find((table) => table.id === nlpTable.id);
                if (table) {
                    table.description = NLPFBAdapter._createDescription(nlpTable.indices, table.name);
                    nlpTable.fields.forEach((nlpField) => {
                        const field: INLPField = table.fields.find((tableField) => tableField.id === nlpField.id);
                        if (field) {
                            field.description = NLPFBAdapter._createDescription(nlpField.indices, field.name);
                            field.refs = nlpField.refs.map((ref) => ({
                                id: ref.id,
                                name: ref.name,
                                description: NLPFBAdapter._createDescription(ref.indices)
                            }));
                        }
                    });
                }
            });
        } catch (error) {
            console.warn(error);
        }

        return tables;
    }
}