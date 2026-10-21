import { Router, type IRouter } from "express";
import accessRequestsRouter from "./access-requests";
import adminUsersRouter from "./admin-users";
import authEntryRouter from "./auth-entry";
import healthRouter from "./health";
import passwordResetRouter from "./password-reset";
import userInviteRouter from "./user-invite";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authEntryRouter);
router.use(accessRequestsRouter);
router.use(adminUsersRouter);
router.use(passwordResetRouter);
router.use(userInviteRouter);

export default router;
