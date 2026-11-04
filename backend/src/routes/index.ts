import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import categoriesRouter from "./categories";
import appCardsRouter from "./app-cards";
import accessRequestsRouter from "./access-requests";
import adminUsersRouter from "./admin-users";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(categoriesRouter);
router.use(appCardsRouter);
router.use(accessRequestsRouter);
router.use(adminUsersRouter);

export default router;
