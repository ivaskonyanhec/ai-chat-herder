namespace ChatHerder.Domain.Common;

public sealed class Result<TValue, TError>
{
    private readonly TValue? _value;
    private readonly TError? _error;

    public bool IsSuccess { get; }

    public TValue Value =>
        IsSuccess ? _value! : throw new InvalidOperationException("Result is a failure.");

    public TError Error =>
        !IsSuccess ? _error! : throw new InvalidOperationException("Result is a success.");

    private Result(TValue value)  { _value = value; IsSuccess = true; }
    private Result(TError error)  { _error = error; IsSuccess = false; }

    public static Result<TValue, TError> Ok(TValue value)   => new(value);
    public static Result<TValue, TError> Fail(TError error) => new(error);

    public TResult Match<TResult>(
        Func<TValue, TResult> onSuccess,
        Func<TError, TResult> onFailure)
        => IsSuccess ? onSuccess(_value!) : onFailure(_error!);
}
