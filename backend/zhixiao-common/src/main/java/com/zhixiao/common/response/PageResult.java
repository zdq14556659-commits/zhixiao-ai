package com.zhixiao.common.response;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

/**
 * Paginated response wrapper
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
public class PageResult<T> {

    private int code;
    private String message;
    private List<T> data;
    private long total;
    private int page;
    private int pageSize;

    public static <T> PageResult<T> success(List<T> data, long total, int page, int pageSize) {
        PageResult<T> result = new PageResult<>();
        result.setCode(200);
        result.setMessage("success");
        result.setData(data);
        result.setTotal(total);
        result.setPage(page);
        result.setPageSize(pageSize);
        return result;
    }

    public static <T> PageResult<T> success(List<T> data, long total) {
        return success(data, total, 1, 10);
    }
}
