import {
  NextFunction,
  Request,
  RequestHandler,
  Response,
  Router
} from "express";
import { Model, Types } from "mongoose";

export const GET_LIST = "GET_LIST";
export const GET_ONE = "GET_ONE";
export const CREATE = "CREATE";
export const UPDATE = "UPDATE";
export const DELETE = "DELETE";

const toPlainObject = (json: any) => JSON.parse(JSON.stringify(json));

type renameIdProps = {
  _id?: string;
  id?: string;
};

/*
  Rename _id to id to match
  ra-data-simple-rest client needs
 */
const renameId = (arr: Array<renameIdProps>) => {
  const newArr = toPlainObject(arr);
  newArr.map((arrItem: renameIdProps) => {
    if ("_id" in arrItem) {
      arrItem.id = arrItem._id;
      delete arrItem._id;
    }
  });
  return newArr;
};

/*
 Get list of resources
 */
const getList = (
  router: Router,
  route: string,
  model: Model<any>,
  middlewares: Array<RequestHandler>,
  select: string | object
) => {
  router.get(
    route + "/",
    middlewares,
    async (req: Request, res: Response, next: NextFunction) => {
      let { sort, range, filter } = req.query;
      if (sort) {
        const a = JSON.parse(sort);
        sort = { [a[0]]: a[1] === "ASC" ? 1 : -1 };
      }
      let skip = 0;
      let limit = 1000;
      if (range) {
        const a = JSON.parse(range);
        skip = a[0];
        limit = a[1] - skip;
      }

      filter = filter ? JSON.parse(filter) : {};
      Object.entries(filter).map(([key, value]: any) => {
        switch (key) {
          case "_id":
            break;
          case "id":
            filter._id = filter.id;
            delete filter.id;
            break;
          case "q":
            filter["$text"] = { $search: `\"${value}\"` };
            delete filter.q;
            break;
          default:
            if (typeof value !== "object") {
              if (Types.ObjectId.isValid(value)) {
                // object id
                filter[key] = Types.ObjectId(value);
              } else {
                // string, number
                filter[key] = new RegExp(value, "i");
              }
            } else if (Array.isArray(value)) {
              // array
              filter["$or"] = value.map(val => {
                return { [key]: val };
              });
              delete filter[key];
            } else {
              // object
            }
        }
      });

      const items = renameId(
        await model
          .find(filter)
          .sort(sort)
          .skip(skip)
          .limit(limit)
          .select(select)
          .exec()
      );
      const total = await model.count(filter);

      res.set("Content-Range", `${skip}-${skip + limit}/${total}`);
      res.json(items);
    }
  );
};

/*
 Get a resource
 */
const getOne = (
  router: Router,
  route: string,
  model: Model<any>,
  middlewares: Array<RequestHandler>,
  select: string | object
) => {
  router.get(
    route + "/:id",
    middlewares,
    async (req: Request, res: Response, next: NextFunction) => {
      const { id } = req.params;
      const item = await model.findOne({ _id: id }).select(select);
      if (!item) {
        res.status(404).json({ error: "Not fould" });
        return;
      }
      res.json(renameId([item])[0]);
    }
  );
};

/*
 Create a resource
 */
const create = (
  router: Router,
  route: string,
  model: Model<any>,
  middlewares: Array<RequestHandler>,
  select: string | object
) => {
  router.post(
    route + "/",
    middlewares,
    async (req: Request, res: Response, next: NextFunction) => {
      const data = req.body;
      const createdItem = await model.create(data);
      const item = await model.findOne({ _id: createdItem._id }).select(select);
      res.status(201).json(renameId([item])[0]);
    }
  );
};

/*
 Update a resource
 */
const update = (
  router: Router,
  route: string,
  model: Model<any>,
  middlewares: Array<RequestHandler>,
  select: string | object
) => {
  router.put(
    route + "/:id",
    middlewares,
    async (req: Request, res: Response, next: NextFunction) => {
      const { id } = req.params;
      const data = req.body;
      const item = await model.findOne({ _id: id }).select(select);
      if (!item) {
        res.status(404).json({ error: "Not fould" });
        return;
      }
      item.set(data);
      await item.save();
      res.json(renameId([item])[0]);
    }
  );
};

/*
 Delete a resource
 */
const delete_ = (
  router: Router,
  route: string,
  model: Model<any>,
  middlewares: Array<RequestHandler>,
  select: string | object
) => {
  router.delete(
    route + "/:id",
    middlewares,
    async (req: Request, res: Response, next: NextFunction) => {
      const { id } = req.params;
      await model.deleteOne({ _id: id }).select(select);
      res.json({ id });
    }
  );
};

const ACTION_TO_FUNC = {
  [GET_LIST]: getList,
  [GET_ONE]: getOne,
  [CREATE]: create,
  [UPDATE]: update,
  [DELETE]: delete_
};

type restProps = {
  router: Router;
  route?: string;
  model: Model<any>;
  actions?: Array<string>;
  middlewares?: Array<RequestHandler>;
  select?: string | object;
};

/*
 Add routes to router
 */
const rest = ({
  router,
  route = "",
  model,
  actions = Object.keys(ACTION_TO_FUNC),
  middlewares = [],
  select = ""
}: restProps) => {
  actions.forEach(action => {
    ACTION_TO_FUNC[action](router, route, model, middlewares, select);
  });
  return router;
};

export default rest;
